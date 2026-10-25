import { and, eq, isNull } from 'drizzle-orm';

import { formatDate } from '@/lib/format';
import { appError, err, ok, type Result } from '@/lib/result';
import { slugify } from '@/lib/slug';

import { db } from '../db/client';
import {
  downloadEvents,
  entitlements,
  notes,
  noteVersions,
  users,
  watermarkedFiles,
} from '../db/schema';
import { logger } from '../logger';
import { watermarkPdf } from '../pdf/watermark';
import { buckets, headObject, presignDownload, readObject, writeObject } from '../storage/s3';

/**
 * Watermarked download (SPEC §4.3): entitlement check → watermarked copy (cached per user and
 * version in the private bucket) → 60-second presigned URL. Every download is logged; there is
 * deliberately no daily limit.
 */
export async function prepareDownload(
  userId: string,
  noteId: string,
  context: { ipHash: string; userAgent: string | null },
): Promise<Result<{ url: string }>> {
  const [entitlement] = await db
    .select({ orderId: entitlements.orderId })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.noteId, noteId),
        isNull(entitlements.revokedAt),
      ),
    );
  if (!entitlement) return err(appError('FORBIDDEN', 'errors.policy.not_entitled'));

  const [note] = await db
    .select({ title: notes.title, currentVersionId: notes.currentVersionId })
    .from(notes)
    .where(eq(notes.id, noteId));
  if (!note?.currentVersionId) return err(appError('NOT_FOUND', 'errors.download.noFile'));
  const [version] = await db
    .select()
    .from(noteVersions)
    .where(eq(noteVersions.id, note.currentVersionId));
  if (!version || version.status !== 'ready')
    return err(appError('NOT_FOUND', 'errors.download.noFile'));

  let [cached] = await db
    .select()
    .from(watermarkedFiles)
    .where(
      and(eq(watermarkedFiles.userId, userId), eq(watermarkedFiles.noteVersionId, version.id)),
    );
  if (cached && !(await headObject(buckets.private, cached.objectKey))) cached = undefined;

  if (!cached) {
    const [buyer] = await db
      .select({ name: users.name, username: users.username, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (!buyer) return err(appError('NOT_FOUND', 'errors.notFound'));
    const original = await readObject(buckets.private, version.fileKey);
    const stamped = await watermarkPdf(original, {
      buyerName: buyer.name,
      username: buyer.username,
      email: buyer.email,
      orderId: entitlement.orderId,
      date: formatDate(new Date()),
    });
    const objectKey = `watermarked/${userId}/${version.id}.pdf`;
    await writeObject(buckets.private, objectKey, stamped, 'application/pdf');
    await db
      .insert(watermarkedFiles)
      .values({ userId, noteVersionId: version.id, orderId: entitlement.orderId, objectKey })
      .onConflictDoUpdate({
        target: [watermarkedFiles.userId, watermarkedFiles.noteVersionId],
        set: { objectKey },
      });
    cached = { objectKey } as typeof watermarkedFiles.$inferSelect;
    logger.info({ userId, versionId: version.id }, 'watermarked copy generated');
  }

  await db
    .insert(downloadEvents)
    .values({
      userId,
      noteVersionId: version.id,
      ipHash: context.ipHash,
      userAgent: context.userAgent?.slice(0, 300) ?? null,
    });
  const filename = `${slugify(note.title) || 'skripta'}-v${version.versionNumber}.pdf`;
  return ok({ url: await presignDownload(cached.objectKey, filename, 60) });
}
