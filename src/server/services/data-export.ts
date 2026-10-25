import { and, desc, eq, gt, inArray, lt, or } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';

import { DATA_EXPORT_TTL_DAYS } from '@/config/notifications';
import { env } from '@/env';
import { appError, err, ok, type Result } from '@/lib/result';

import { db } from '../db/client';
import {
  accounts,
  auditLog,
  bookmarks,
  comments,
  communities,
  communityMembers,
  consents,
  dataExports,
  downloadEvents,
  entitlements,
  follows,
  ledgerEntries,
  notes,
  noteVersions,
  notificationPreferences,
  notifications,
  notificationSettings,
  orderItems,
  orders,
  payouts,
  pollVotes,
  posts,
  refunds,
  reports,
  reviews,
  sellerProfiles,
  sessions,
  studentProfiles,
  userCourseStatus,
  users,
  votes,
} from '../db/schema';
import { sendActionEmail } from '../email/send';
import { sendEvent } from '../jobs/client';
import { logger } from '../logger';
import { buckets, deleteObject, presignDownload, writeObject } from '../storage/s3';

/**
 * Everything stored about one user (SPEC §4.8, §7.2 right of access), and only that: rows of
 * other people are reduced to what concerns this user (e.g. a sale shows the note and amount,
 * never the buyer). Secrets (password hashes, session tokens, 2FA secrets, OAuth tokens) and
 * encrypted payout details are left out; the payout account appears as its last 4 digits.
 */
export async function collectUserData(userId: string): Promise<Record<string, unknown>> {
  const [account] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      username: users.username,
      image: users.image,
      role: users.role,
      twoFactorEnabled: users.twoFactorEnabled,
      deletionRequestedAt: users.deletionRequestedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  const ownOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.buyerId, userId));
  const orderIds = ownOrders.map((order) => order.id);
  const ownPosts = await db.select({ id: posts.id }).from(posts).where(eq(posts.authorId, userId));

  const [
    signInMethods,
    activeSessions,
    profile,
    courses,
    consentHistory,
    seller,
    sellerNotes,
    purchases,
    purchasedItems,
    sales,
    ledger,
    payoutHistory,
    refundRequests,
    library,
    downloads,
    saved,
    reviewsWritten,
    repliesToReviews,
    postsWritten,
    commentsWritten,
    votesCast,
    pollAnswers,
    memberships,
    reportsFiled,
    notificationList,
    preferences,
    digest,
    following,
    ownActions,
    exportsHistory,
  ] = await Promise.all([
    db
      .select({ provider: accounts.providerId, createdAt: accounts.createdAt })
      .from(accounts)
      .where(eq(accounts.userId, userId)),
    db
      .select({
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(eq(sessions.userId, userId)),
    db
      .select({
        universityId: studentProfiles.universityId,
        facultyId: studentProfiles.facultyId,
        programId: studentProfiles.programId,
        year: studentProfiles.year,
        studentVerifiedAt: studentProfiles.studentVerifiedAt,
        studentEmail: studentProfiles.studentEmail,
        bio: studentProfiles.bio,
        isAdult: studentProfiles.isAdult,
        showFaculty: studentProfiles.showFaculty,
        showProgram: studentProfiles.showProgram,
        showActivity: studentProfiles.showActivity,
      })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, userId)),
    db
      .select({
        courseId: userCourseStatus.courseId,
        status: userCourseStatus.status,
        grade: userCourseStatus.grade,
        examPeriod: userCourseStatus.examPeriod,
        professorId: userCourseStatus.professorId,
      })
      .from(userCourseStatus)
      .where(eq(userCourseStatus.userId, userId)),
    db
      .select({
        type: consents.type,
        documentVersion: consents.documentVersion,
        value: consents.value,
        createdAt: consents.createdAt,
      })
      .from(consents)
      .where(eq(consents.userId, userId)),
    db
      .select({
        status: sellerProfiles.status,
        sellerTermsVersion: sellerProfiles.sellerTermsVersion,
        sellerTermsAcceptedAt: sellerProfiles.sellerTermsAcceptedAt,
        payoutAccountLast4: sellerProfiles.payoutAccountLast4,
        payoutDetailsUpdatedAt: sellerProfiles.payoutDetailsUpdatedAt,
      })
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, userId)),
    db
      .select({
        id: notes.id,
        title: notes.title,
        slug: notes.slug,
        status: notes.status,
        pricePara: notes.pricePara,
        shortDescription: notes.shortDescription,
        createdAt: notes.createdAt,
      })
      .from(notes)
      .where(eq(notes.sellerId, userId)),
    db
      .select({
        id: orders.id,
        status: orders.status,
        totalPara: orders.totalPara,
        provider: orders.provider,
        paidAt: orders.paidAt,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(eq(orders.buyerId, userId)),
    orderIds.length
      ? db
          .select({
            orderId: orderItems.orderId,
            noteId: orderItems.noteId,
            noteTitle: notes.title,
            pricePara: orderItems.pricePara,
          })
          .from(orderItems)
          .innerJoin(notes, eq(notes.id, orderItems.noteId))
          .where(inArray(orderItems.orderId, orderIds))
      : Promise.resolve([]),
    // Sales: amounts and notes only; the buyer is someone else's personal data.
    db
      .select({
        noteId: orderItems.noteId,
        noteTitle: notes.title,
        pricePara: orderItems.pricePara,
        commissionPara: orderItems.commissionPara,
        sellerPara: orderItems.sellerPara,
        soldAt: orders.paidAt,
        releasedAt: orderItems.releasedAt,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(notes, eq(notes.id, orderItems.noteId))
      .where(and(eq(orderItems.sellerId, userId), eq(orders.status, 'paid'))),
    db
      .select({
        accountType: ledgerEntries.accountType,
        amountPara: ledgerEntries.amountPara,
        referenceType: ledgerEntries.referenceType,
        description: ledgerEntries.description,
        createdAt: ledgerEntries.createdAt,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.accountOwnerId, userId)),
    db
      .select({
        amountPara: payouts.amountPara,
        status: payouts.status,
        paidAt: payouts.paidAt,
        rejectionReason: payouts.rejectionReason,
        createdAt: payouts.createdAt,
      })
      .from(payouts)
      .where(eq(payouts.sellerId, userId)),
    orderIds.length
      ? db
          .select({
            orderId: refunds.orderId,
            reason: refunds.reason,
            text: refunds.text,
            status: refunds.status,
            amountPara: refunds.amountPara,
            createdAt: refunds.createdAt,
          })
          .from(refunds)
          .where(inArray(refunds.orderId, orderIds))
      : Promise.resolve([]),
    db
      .select({
        noteId: entitlements.noteId,
        grantedAt: entitlements.grantedAt,
        revokedAt: entitlements.revokedAt,
      })
      .from(entitlements)
      .where(eq(entitlements.userId, userId)),
    db
      .select({
        noteVersionId: downloadEvents.noteVersionId,
        versionNumber: noteVersions.versionNumber,
        createdAt: downloadEvents.createdAt,
      })
      .from(downloadEvents)
      .innerJoin(noteVersions, eq(noteVersions.id, downloadEvents.noteVersionId))
      .where(eq(downloadEvents.userId, userId)),
    db
      .select({ noteId: bookmarks.noteId, createdAt: bookmarks.createdAt })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId)),
    db
      .select({
        noteId: reviews.noteId,
        rating: reviews.rating,
        text: reviews.text,
        passedGrade: reviews.passedGrade,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .where(eq(reviews.userId, userId)),
    // The seller's own replies (the review text belongs to the reviewer and is left out).
    db
      .select({
        noteId: reviews.noteId,
        reply: reviews.sellerReply,
        repliedAt: reviews.sellerRepliedAt,
      })
      .from(reviews)
      .innerJoin(notes, eq(notes.id, reviews.noteId))
      .where(and(eq(notes.sellerId, userId))),
    db
      .select({
        id: posts.id,
        communityId: posts.communityId,
        type: posts.type,
        title: posts.title,
        body: posts.body,
        url: posts.url,
        isAnonymous: posts.isAnonymous,
        createdAt: posts.createdAt,
        deletedAt: posts.deletedAt,
      })
      .from(posts)
      .where(eq(posts.authorId, userId)),
    db
      .select({
        id: comments.id,
        postId: comments.postId,
        body: comments.body,
        isAnonymous: comments.isAnonymous,
        createdAt: comments.createdAt,
        deletedAt: comments.deletedAt,
      })
      .from(comments)
      .where(eq(comments.authorId, userId)),
    db
      .select({
        targetType: votes.targetType,
        targetId: votes.targetId,
        value: votes.value,
        createdAt: votes.createdAt,
      })
      .from(votes)
      .where(eq(votes.userId, userId)),
    db
      .select({ postId: pollVotes.postId, optionId: pollVotes.optionId })
      .from(pollVotes)
      .where(eq(pollVotes.userId, userId)),
    db
      .select({
        community: communities.slug,
        role: communityMembers.role,
        joinedAt: communityMembers.joinedAt,
        bannedUntil: communityMembers.bannedUntil,
      })
      .from(communityMembers)
      .innerJoin(communities, eq(communities.id, communityMembers.communityId))
      .where(eq(communityMembers.userId, userId)),
    db
      .select({
        targetType: reports.targetType,
        targetId: reports.targetId,
        reason: reports.reason,
        text: reports.text,
        status: reports.status,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.reporterId, userId)),
    db
      .select({
        type: notifications.type,
        payload: notifications.payload,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(eq(notifications.userId, userId)),
    db
      .select({ type: notificationPreferences.type, channel: notificationPreferences.channel })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId)),
    db
      .select({ digest: notificationSettings.digest })
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId)),
    db
      .select({
        targetType: follows.targetType,
        targetId: follows.targetId,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .where(eq(follows.userId, userId)),
    db
      .select({
        action: auditLog.action,
        targetType: auditLog.targetType,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(eq(auditLog.actorId, userId)),
    db
      .select({ status: dataExports.status, createdAt: dataExports.createdAt })
      .from(dataExports)
      .where(eq(dataExports.userId, userId)),
  ]);
  return {
    account: account ?? null,
    signInMethods,
    sessions: activeSessions,
    studentProfile: profile[0] ?? null,
    courses,
    consents: consentHistory,
    sellerProfile: seller[0] ?? null,
    notesForSale: sellerNotes,
    purchases: purchases.map((order) => ({
      ...order,
      items: purchasedItems.filter((item) => item.orderId === order.id),
    })),
    sales,
    walletLedger: ledger,
    payouts: payoutHistory,
    refundRequests,
    library,
    downloads,
    savedNotes: saved,
    reviewsWritten,
    repliesToReviews: repliesToReviews.filter((row) => row.reply),
    posts: postsWritten,
    comments: commentsWritten,
    votes: votesCast,
    pollAnswers,
    communityMemberships: memberships,
    reportsFiled,
    notifications: notificationList,
    notificationPreferences: preferences,
    digest: digest[0]?.digest ?? 'weekly',
    following,
    ownActions,
    dataExports: exportsHistory,
    meta: { generatedAt: new Date().toISOString(), postCount: ownPosts.length },
  };
}

const README = `Izvoz podataka sa Skriptarnice

Ova arhiva sadrži sve podatke koje čuvamo o tvom nalogu, u JSON formatu (podaci.json).
Iznosi su u parama (1 RSD = 100 para). Datumi su u UTC (ISO 8601).

Iz izvoza su izostavljeni:
- lozinka, kodovi za dvofaktorsku prijavu i tokeni sesija (tajni podaci za prijavu),
- šifrovani podaci o računu za isplate (prikazane su poslednje 4 cifre),
- podaci drugih korisnika (npr. ko je kupio tvoju skriptu).
`;

export function buildExportZip(data: Record<string, unknown>): Uint8Array {
  return zipSync(
    {
      'README.txt': strToU8(README),
      'podaci.json': strToU8(JSON.stringify(data, null, 2)),
    },
    { level: 6 },
  );
}

/** One export per 24 hours; a pending or still-valid recent export is returned instead. */
export async function requestExport(
  userId: string,
): Promise<Result<{ id: string; status: string }>> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [recent] = await db
    .select()
    .from(dataExports)
    .where(
      and(
        eq(dataExports.userId, userId),
        gt(dataExports.createdAt, since),
        or(eq(dataExports.status, 'pending'), eq(dataExports.status, 'ready')),
      ),
    )
    .orderBy(desc(dataExports.createdAt))
    .limit(1);
  if (recent) return ok({ id: recent.id, status: recent.status });
  const [created] = await db
    .insert(dataExports)
    .values({ userId })
    .returning({ id: dataExports.id });
  if (!created) return err(appError('INTERNAL', 'errors.internal'));
  try {
    await sendEvent(
      'user/export.requested',
      { userId, exportId: created.id },
      `export-${created.id}`,
    );
  } catch {
    await db.update(dataExports).set({ status: 'failed' }).where(eq(dataExports.id, created.id));
    return err(appError('INTERNAL', 'errors.internal'));
  }
  return ok({ id: created.id, status: 'pending' });
}

/** Job body: builds the zip, stores it privately, emails a link that needs a signed-in owner. */
export async function generateExport(exportId: string): Promise<void> {
  const [row] = await db
    .select({ export: dataExports, email: users.email })
    .from(dataExports)
    .innerJoin(users, eq(users.id, dataExports.userId))
    .where(eq(dataExports.id, exportId));
  if (!row || row.export.status !== 'pending') return;
  const zip = buildExportZip(await collectUserData(row.export.userId));
  const key = `exports/${row.export.userId}/${exportId}.zip`;
  await writeObject(buckets.private, key, zip, 'application/zip');
  const now = new Date();
  await db
    .update(dataExports)
    .set({
      status: 'ready',
      storageKey: key,
      sizeBytes: zip.byteLength,
      readyAt: now,
      expiresAt: new Date(now.getTime() + DATA_EXPORT_TTL_DAYS * 86_400_000),
    })
    .where(eq(dataExports.id, exportId));
  await sendActionEmail(
    'exportReady',
    row.email,
    `${env.NEXT_PUBLIC_APP_URL}/api/izvoz/${exportId}`,
    { days: DATA_EXPORT_TTL_DAYS },
  );
  logger.info({ exportId, bytes: zip.byteLength }, 'data export ready');
}

export async function exportDownloadUrl(userId: string, exportId: string): Promise<Result<string>> {
  const [row] = await db
    .select()
    .from(dataExports)
    .where(and(eq(dataExports.id, exportId), eq(dataExports.userId, userId)));
  // Someone else's export looks exactly like a missing one (no IDOR oracle).
  if (!row || row.status !== 'ready' || !row.storageKey)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  if (row.expiresAt && row.expiresAt < new Date())
    return err(appError('NOT_FOUND', 'errors.exportExpired'));
  await db.update(dataExports).set({ downloaded: true }).where(eq(dataExports.id, exportId));
  return ok(
    await presignDownload(
      row.storageKey,
      `skriptarnica-podaci-${row.createdAt.toISOString().slice(0, 10)}.zip`,
      60,
      'application/zip',
    ),
  );
}

export async function latestExport(userId: string) {
  const [row] = await db
    .select()
    .from(dataExports)
    .where(eq(dataExports.userId, userId))
    .orderBy(desc(dataExports.createdAt))
    .limit(1);
  return row ?? null;
}

/** Cleanup (daily): expired exports lose their file. */
export async function expireExports(now = new Date()): Promise<number> {
  const due = await db
    .select({ id: dataExports.id, key: dataExports.storageKey })
    .from(dataExports)
    .where(and(eq(dataExports.status, 'ready'), lt(dataExports.expiresAt, now)));
  for (const row of due) {
    if (row.key) await deleteObject(buckets.private, row.key);
    await db
      .update(dataExports)
      .set({ status: 'expired', storageKey: null })
      .where(eq(dataExports.id, row.id));
  }
  return due.length;
}
