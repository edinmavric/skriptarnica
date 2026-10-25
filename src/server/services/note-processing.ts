import { and, desc, eq, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';

import { DUPLICATE_MAX_DISTANCE, simhash } from '@/lib/simhash';

import { db } from '../db/client';
import { notePreviews, notes, noteVersions, type NoteModerationFlags } from '../db/schema';
import { trySendEvent } from '../jobs/client';
import { logger } from '../logger';
import { analyzePdf, previewPageCount, renderPreviews } from '../pdf/analyze';
import { buckets, deleteObject, readObject, writeObject } from '../storage/s3';

import { getSettings } from './settings';

/**
 * Background processing of an uploaded note version (SPEC §4.4 step 3). Each function is
 * idempotent so job retries are safe.
 */

/** Longest extracted text we store (search + duplicate detection don't need more). */
const MAX_TEXT_CHARS = 400_000;

export async function processVersion(
  versionId: string,
): Promise<{ status: 'ready' | 'failed'; errorKey?: string }> {
  const [version] = await db.select().from(noteVersions).where(eq(noteVersions.id, versionId));
  if (!version) throw new Error(`version ${versionId} not found`);
  if (version.status === 'ready') return { status: 'ready' };
  if (version.status === 'failed')
    return { status: 'failed', ...(version.errorKey ? { errorKey: version.errorKey } : {}) };
  await db.update(noteVersions).set({ status: 'processing' }).where(eq(noteVersions.id, versionId));

  const settings = await getSettings();
  const buffer = await readObject(buckets.private, version.fileKey);
  const analysis = await analyzePdf(buffer, settings.maxPdfSizeBytes);
  if (!analysis.ok) {
    const errorKey = `notes.processing.${analysis.reason}`;
    // Don't keep files we refuse to serve (encrypted, scripted, not a PDF).
    await deleteObject(buckets.private, version.fileKey);
    await db
      .update(noteVersions)
      .set({ status: 'failed', errorKey })
      .where(eq(noteVersions.id, versionId));
    logger.info({ versionId, reason: analysis.reason }, 'note version rejected');
    return { status: 'failed', errorKey };
  }

  const count = previewPageCount(
    analysis.value.pageCount,
    settings.previewPagesMax,
    settings.previewPagesMaxRatio,
  );
  const previews = await renderPreviews(buffer, count);
  await db.delete(notePreviews).where(eq(notePreviews.noteVersionId, versionId));
  for (const preview of previews) {
    const key = `previews/${version.noteId}/${versionId}/${preview.pageNumber}.webp`;
    await writeObject(
      buckets.public,
      key,
      preview.webp,
      'image/webp',
      'public, max-age=31536000, immutable',
    );
    await db.insert(notePreviews).values({
      noteVersionId: versionId,
      pageNumber: preview.pageNumber,
      imageKey: key,
      width: preview.width,
      height: preview.height,
      blurred: preview.blurred,
    });
  }
  await db
    .update(noteVersions)
    .set({
      status: 'ready',
      errorKey: null,
      pageCount: analysis.value.pageCount,
      sha256: analysis.value.sha256,
      simhash: simhash(analysis.value.text),
      extractedText: analysis.value.text.slice(0, MAX_TEXT_CHARS),
    })
    .where(eq(noteVersions.id, versionId));
  // Drafts can move on to the description step once the file is processed.
  await db
    .update(notes)
    .set({ pageCount: analysis.value.pageCount, wizardStep: sql`greatest(${notes.wizardStep}, 4)` })
    .where(and(eq(notes.id, version.noteId), isNull(notes.publishedAt)));
  return { status: 'ready' };
}

/**
 * Duplicate/resale detection (SPEC §4.4): the same file hash or a near-identical text
 * fingerprint in another seller's EARLIER upload flags this note for review (the original
 * author is never flagged by a later copy).
 */
export async function checkDuplicates(
  versionId: string,
): Promise<NoteModerationFlags['possibleDuplicate'] | null> {
  const [row] = await db
    .select({ version: noteVersions, sellerId: notes.sellerId, flags: notes.moderationFlags })
    .from(noteVersions)
    .innerJoin(notes, eq(notes.id, noteVersions.noteId))
    .where(eq(noteVersions.id, versionId));
  if (!row || row.version.status !== 'ready') return null;
  const { version, sellerId } = row;

  let match: NoteModerationFlags['possibleDuplicate'] | null = null;
  if (version.sha256) {
    const [same] = await db
      .select({ noteId: noteVersions.noteId, versionId: noteVersions.id })
      .from(noteVersions)
      .innerJoin(notes, eq(notes.id, noteVersions.noteId))
      .where(
        and(
          eq(noteVersions.sha256, version.sha256),
          ne(notes.sellerId, sellerId),
          lt(noteVersions.createdAt, version.createdAt),
        ),
      )
      .limit(1);
    if (same) match = { noteId: same.noteId, versionId: same.versionId, reason: 'same_hash' };
  }
  if (!match && version.simhash !== null) {
    const distance = sql<number>`bit_count((${noteVersions.simhash} # ${version.simhash.toString()}::bigint)::bit(64))`;
    const [similar] = await db
      .select({ noteId: noteVersions.noteId, versionId: noteVersions.id, distance })
      .from(noteVersions)
      .innerJoin(notes, eq(notes.id, noteVersions.noteId))
      .where(
        and(
          isNotNull(noteVersions.simhash),
          ne(notes.sellerId, sellerId),
          lt(noteVersions.createdAt, version.createdAt),
          sql`${distance} <= ${DUPLICATE_MAX_DISTANCE}`,
        ),
      )
      .orderBy(distance)
      .limit(1);
    if (similar)
      match = {
        noteId: similar.noteId,
        versionId: similar.versionId,
        reason: 'similar_text',
        distance: Number(similar.distance),
      };
  }
  if (match) {
    await db
      .update(notes)
      .set({ moderationFlags: { ...row.flags, possibleDuplicate: match } })
      .where(eq(notes.id, version.noteId));
    logger.info(
      { noteId: version.noteId, matchNoteId: match.noteId, reason: match.reason },
      'possible duplicate flagged',
    );
  }
  return match;
}

/**
 * New versions of already-published notes go live automatically, unless this version was
 * flagged as a possible duplicate — then the note returns to review. Buyers are notified.
 */
export async function finalizeVersion(
  versionId: string,
  flaggedAsDuplicate: boolean,
): Promise<'published' | 'review' | 'draft' | 'failed'> {
  const [row] = await db
    .select({ version: noteVersions, note: notes })
    .from(noteVersions)
    .innerJoin(notes, eq(notes.id, noteVersions.noteId))
    .where(eq(noteVersions.id, versionId));
  if (!row || row.version.status !== 'ready') return 'failed';
  const { version, note } = row;
  // Drafts are published by the seller from the wizard.
  if (!note.publishedAt) return 'draft';
  const [latest] = await db
    .select({ id: noteVersions.id })
    .from(noteVersions)
    .where(eq(noteVersions.noteId, note.id))
    .orderBy(desc(noteVersions.versionNumber))
    .limit(1);
  if (latest?.id !== versionId) return 'draft';
  if (flaggedAsDuplicate) {
    await db.update(notes).set({ status: 'pending_review' }).where(eq(notes.id, note.id));
    return 'review';
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(noteVersions).set({ publishedAt: now }).where(eq(noteVersions.id, versionId));
    await tx
      .update(notes)
      .set({ currentVersionId: versionId, pageCount: version.pageCount ?? note.pageCount })
      .where(eq(notes.id, note.id));
  });
  await trySendEvent(
    'note/version.published',
    { noteId: note.id, versionId, versionNumber: version.versionNumber },
    `version-published-${versionId}`,
  );
  return 'published';
}

export async function markVersionFailed(versionId: string, errorKey: string): Promise<void> {
  await db
    .update(noteVersions)
    .set({ status: 'failed', errorKey })
    .where(eq(noteVersions.id, versionId));
}
