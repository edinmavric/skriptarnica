import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '../db/client';
import {
  courses,
  downloadEvents,
  entitlements,
  notes,
  noteVersions,
  orders,
  refunds,
  reviews,
} from '../db/schema';

import { getSettings } from './settings';

/** The buyer's library (SPEC §4.3): purchases, new-version flags, review and refund state. */
export async function getLibrary(userId: string) {
  const rows = await db
    .select({
      noteId: notes.id,
      title: notes.title,
      slug: notes.slug,
      courseName: courses.name,
      orderId: entitlements.orderId,
      grantedAt: entitlements.grantedAt,
      paidAt: orders.paidAt,
      totalPara: orders.totalPara,
      currentVersionId: notes.currentVersionId,
      currentVersionNumber: noteVersions.versionNumber,
      currentVersionChangelog: noteVersions.changelog,
    })
    .from(entitlements)
    .innerJoin(notes, eq(notes.id, entitlements.noteId))
    .innerJoin(orders, eq(orders.id, entitlements.orderId))
    .leftJoin(courses, eq(courses.id, notes.courseId))
    .leftJoin(noteVersions, eq(noteVersions.id, notes.currentVersionId))
    .where(and(eq(entitlements.userId, userId), isNull(entitlements.revokedAt)))
    .orderBy(desc(entitlements.grantedAt));
  if (rows.length === 0) return [];
  const noteIds = rows.map((row) => row.noteId);
  const orderIds = rows.map((row) => row.orderId);
  const [downloaded, reviewRows, refundRows, settings] = await Promise.all([
    db
      .select({
        noteId: noteVersions.noteId,
        maxVersion: sql<number>`max(${noteVersions.versionNumber})::int`,
      })
      .from(downloadEvents)
      .innerJoin(noteVersions, eq(noteVersions.id, downloadEvents.noteVersionId))
      .where(and(eq(downloadEvents.userId, userId), inArray(noteVersions.noteId, noteIds)))
      .groupBy(noteVersions.noteId),
    db.select({ orderId: reviews.orderId }).from(reviews).where(inArray(reviews.orderId, orderIds)),
    db
      .select({ orderId: refunds.orderId, status: refunds.status })
      .from(refunds)
      .where(inArray(refunds.orderId, orderIds))
      .orderBy(desc(refunds.createdAt)),
    getSettings(),
  ]);
  const downloadedMax = new Map(downloaded.map((row) => [row.noteId, row.maxVersion]));
  const reviewed = new Set(reviewRows.map((row) => row.orderId));
  const now = Date.now();
  return rows.map((row) => {
    const lastDownloaded = downloadedMax.get(row.noteId) ?? null;
    const refund = refundRows.find((r) => r.orderId === row.orderId) ?? null;
    const windowEnds = row.paidAt
      ? row.paidAt.getTime() + settings.purchaseProblemWindowDays * 86_400_000
      : 0;
    return {
      ...row,
      hasNewVersion:
        lastDownloaded !== null &&
        row.currentVersionNumber !== null &&
        row.currentVersionNumber > lastDownloaded,
      neverDownloaded: lastDownloaded === null,
      reviewed: reviewed.has(row.orderId),
      refundStatus: refund?.status ?? null,
      canRequestRefund: row.totalPara > 0 && !refund && now < windowEnds,
    };
  });
}

export type LibraryItem = Awaited<ReturnType<typeof getLibrary>>[number];
