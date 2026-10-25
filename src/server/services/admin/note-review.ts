import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { appError, err, ok, type Result } from '@/lib/result';

import { db } from '../../db/client';
import { courses, faculties, notePreviews, notes, noteVersions, users } from '../../db/schema';
import { trySendEvent } from '../../jobs/client';
import { publicUrl } from '../../storage/s3';

import { audit } from './audit';

export async function listPendingNotes() {
  return db
    .select({
      id: notes.id,
      title: notes.title,
      updatedAt: notes.updatedAt,
      flags: notes.moderationFlags,
      sellerName: users.name,
      sellerId: users.id,
      courseName: courses.name,
      facultyShortName: faculties.shortName,
    })
    .from(notes)
    .innerJoin(users, eq(users.id, notes.sellerId))
    .leftJoin(courses, eq(courses.id, notes.courseId))
    .leftJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(and(eq(notes.status, 'pending_review'), isNull(notes.deletedAt)))
    .orderBy(asc(notes.updatedAt));
}

async function noteWithPreviews(noteId: string) {
  const [row] = await db
    .select({
      note: notes,
      seller: { id: users.id, name: users.name, email: users.email },
      courseName: courses.name,
    })
    .from(notes)
    .innerJoin(users, eq(users.id, notes.sellerId))
    .leftJoin(courses, eq(courses.id, notes.courseId))
    .where(eq(notes.id, noteId));
  if (!row) return null;
  const [latest] = await db
    .select()
    .from(noteVersions)
    .where(eq(noteVersions.noteId, noteId))
    .orderBy(desc(noteVersions.versionNumber))
    .limit(1);
  const previews = latest
    ? await db
        .select()
        .from(notePreviews)
        .where(eq(notePreviews.noteVersionId, latest.id))
        .orderBy(asc(notePreviews.pageNumber))
    : [];
  return {
    ...row,
    latest: latest ?? null,
    previews: previews.map((p) => ({
      pageNumber: p.pageNumber,
      url: publicUrl(p.imageKey),
      width: p.width,
      height: p.height,
      blurred: p.blurred,
    })),
  };
}

/** Review detail; for possible duplicates the matched note is loaded for side-by-side comparison. */
export async function getReviewNote(noteId: string) {
  const subject = await noteWithPreviews(noteId);
  if (!subject) return null;
  const match = subject.note.moderationFlags.possibleDuplicate;
  const matched = match ? await noteWithPreviews(match.noteId) : null;
  return { subject, matched, match: match ?? null };
}

export async function approveNote(
  adminId: string,
  noteId: string,
  ipHash: string,
): Promise<Result<void>> {
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!note || note.status !== 'pending_review')
    return err(appError('CONFLICT', 'errors.admin.notPending'));
  const versions = await db
    .select()
    .from(noteVersions)
    .where(and(eq(noteVersions.noteId, noteId), inArray(noteVersions.status, ['ready'])))
    .orderBy(desc(noteVersions.versionNumber))
    .limit(1);
  const latest = versions[0];
  if (!latest) return err(appError('CONFLICT', 'errors.admin.noReadyVersion'));
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(notes)
      .set({
        status: 'published',
        publishedAt: note.publishedAt ?? now,
        currentVersionId: latest.id,
        pageCount: latest.pageCount ?? note.pageCount,
        rejectionReason: null,
      })
      .where(eq(notes.id, noteId));
    await tx
      .update(noteVersions)
      .set({ publishedAt: latest.publishedAt ?? now })
      .where(eq(noteVersions.id, latest.id));
    await audit(tx, {
      actorId: adminId,
      action: 'note.approved',
      targetType: 'note',
      targetId: noteId,
      details: { versionId: latest.id, flags: note.moderationFlags },
      ipHash,
    });
  });
  await trySendEvent(
    'note/decided',
    { noteId, decision: 'approved', reason: null },
    `note-decided-${noteId}-${now.getTime()}`,
  );
  return ok(undefined);
}

export async function rejectNote(
  adminId: string,
  noteId: string,
  reason: string,
  ipHash: string,
): Promise<Result<void>> {
  const [note] = await db.select().from(notes).where(eq(notes.id, noteId));
  if (!note || note.status !== 'pending_review')
    return err(appError('CONFLICT', 'errors.admin.notPending'));
  await db.transaction(async (tx) => {
    await tx
      .update(notes)
      .set({ status: 'rejected', rejectionReason: reason })
      .where(eq(notes.id, noteId));
    await audit(tx, {
      actorId: adminId,
      action: 'note.rejected',
      targetType: 'note',
      targetId: noteId,
      details: { reason },
      ipHash,
    });
  });
  await trySendEvent(
    'note/decided',
    { noteId, decision: 'rejected', reason },
    `note-decided-${noteId}-${Date.now()}`,
  );
  return ok(undefined);
}
