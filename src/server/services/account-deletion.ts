import { and, eq, inArray, isNull, lte, ne, sql } from 'drizzle-orm';

import { ACCOUNT_DELETION_GRACE_DAYS } from '@/config/notifications';
import { routes } from '@/config/routes';
import { env } from '@/env';
import { formatDate } from '@/lib/format';
import { appError, err, ok, type Result } from '@/lib/result';

import { db } from '../db/client';
import {
  accounts,
  auditLog,
  bookmarks,
  comments,
  communityMembers,
  dataExports,
  follows,
  notes,
  notificationPreferences,
  notifications,
  notificationSettings,
  payouts,
  posts,
  sellerProfiles,
  sessions,
  studentProfiles,
  twoFactors,
  userCourseStatus,
  users,
} from '../db/schema';
import { sendActionEmail } from '../email/send';
import { logger } from '../logger';
import { buckets, deleteObject } from '../storage/s3';
import { sellerBalances } from './ledger';
import { invalidateNoteListings } from './note-pages';

export type DeletionBlocker = 'balance' | 'open_payout';

/** An unpaid balance blocks deletion unless explicitly waived; an open payout always does (SPEC §7.3). */
export async function deletionStatus(
  userId: string,
): Promise<{ balancePara: number; openPayout: boolean }> {
  const balances = await sellerBalances(userId);
  const [open] = await db
    .select({ id: payouts.id })
    .from(payouts)
    .where(
      and(
        eq(payouts.sellerId, userId),
        inArray(payouts.status, ['requested', 'approved', 'processing']),
      ),
    )
    .limit(1);
  return { balancePara: balances.pendingPara + balances.availablePara, openPayout: Boolean(open) };
}

export async function hasPassword(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'credential')));
  return Boolean(row);
}

/**
 * Schedules deletion after the grace period. The caller has already confirmed identity
 * (password, or a signed email link for accounts without one). Other sessions are signed out.
 */
export async function scheduleDeletion(input: {
  userId: string;
  currentSessionId: string | null;
  deleteContent: boolean;
  waiveBalance: boolean;
  ipHash: string | null;
}): Promise<Result<{ scheduledFor: Date }>> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId));
  if (!user || user.deletedAt) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (user.deletionScheduledFor) return ok({ scheduledFor: user.deletionScheduledFor });
  const status = await deletionStatus(input.userId);
  if (status.openPayout) return err(appError('CONFLICT', 'errors.account.openPayout'));
  if (status.balancePara > 0 && !input.waiveBalance)
    return err(appError('CONFLICT', 'errors.account.balance'));
  const now = new Date();
  const scheduledFor = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 86_400_000);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        deletionRequestedAt: now,
        deletionScheduledFor: scheduledFor,
        deletionDeleteContent: input.deleteContent,
      })
      .where(eq(users.id, input.userId));
    await tx
      .delete(sessions)
      .where(
        and(
          eq(sessions.userId, input.userId),
          input.currentSessionId ? ne(sessions.id, input.currentSessionId) : undefined,
        ),
      );
    await tx.insert(auditLog).values({
      actorId: input.userId,
      action: 'account.deletion_requested',
      targetType: 'user',
      targetId: input.userId,
      details: {
        scheduledFor: scheduledFor.toISOString(),
        deleteContent: input.deleteContent,
        ...(status.balancePara > 0 ? { waivedBalancePara: status.balancePara } : {}),
      },
      ipHash: input.ipHash,
    });
  });
  await sendActionEmail(
    'deletionScheduled',
    user.email,
    `${env.NEXT_PUBLIC_APP_URL}${routes.settings}/podaci`,
    {
      date: formatDate(scheduledFor),
    },
  );
  return ok({ scheduledFor });
}

export async function cancelDeletion(userId: string, ipHash: string | null): Promise<Result<void>> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.deletedAt) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (!user.deletionScheduledFor) return ok(undefined);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ deletionRequestedAt: null, deletionScheduledFor: null, deletionDeleteContent: false })
      .where(eq(users.id, userId));
    await tx.insert(auditLog).values({
      actorId: userId,
      action: 'account.deletion_cancelled',
      targetType: 'user',
      targetId: userId,
      ipHash,
    });
  });
  await sendActionEmail('deletionCancelled', user.email, env.NEXT_PUBLIC_APP_URL);
  return ok(undefined);
}

/**
 * The deletion itself (SPEC §7.3): personal data deleted or anonymized; posts/comments stay as
 * "[obrisan korisnik]" or are deleted (the user's choice); notes leave the store while buyers
 * keep access; orders, ledger and payouts stay, pseudonymized by the anonymized user row.
 */
export async function executeDeletion(userId: string, now = new Date()): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.deletedAt || !user.deletionScheduledFor || user.deletionScheduledFor > now)
    return false;
  const exportKeys = await db
    .select({ key: dataExports.storageKey })
    .from(dataExports)
    .where(eq(dataExports.userId, userId));
  await db.transaction(async (tx) => {
    // Membership counters without touching updated_at (see DECISIONS, Phase 5).
    await tx.execute(sql`
      UPDATE communities SET member_count = GREATEST(member_count - 1, 0)
      WHERE id IN (SELECT community_id FROM community_members WHERE user_id = ${userId})`);
    await tx.delete(communityMembers).where(eq(communityMembers.userId, userId));
    for (const table of [
      sessions,
      accounts,
      twoFactors,
      notifications,
      notificationPreferences,
      notificationSettings,
      bookmarks,
      userCourseStatus,
      dataExports,
    ] as const) {
      await tx.delete(table).where(eq(table.userId, userId));
    }
    await tx.delete(follows).where(eq(follows.userId, userId));
    await tx
      .delete(follows)
      .where(and(eq(follows.targetType, 'seller'), eq(follows.targetId, userId)));
    await tx.delete(studentProfiles).where(eq(studentProfiles.userId, userId));
    await tx
      .update(sellerProfiles)
      .set({
        payoutHolderEnc: null,
        payoutAccountEnc: null,
        payoutAccountLast4: null,
        status: 'suspended',
      })
      .where(eq(sellerProfiles.userId, userId));
    // Off sale; buyers keep their entitlements and downloads.
    await tx
      .update(notes)
      .set({ status: 'unlisted' })
      .where(
        and(
          eq(notes.sellerId, userId),
          inArray(notes.status, ['draft', 'processing', 'pending_review', 'published']),
        ),
      );
    if (user.deletionDeleteContent) {
      await tx
        .update(posts)
        .set({ deletedAt: now })
        .where(and(eq(posts.authorId, userId), isNull(posts.deletedAt)));
      await tx
        .update(comments)
        .set({ deletedAt: now, body: '' })
        .where(and(eq(comments.authorId, userId), isNull(comments.deletedAt)));
    }
    await tx
      .update(users)
      .set({
        name: 'Obrisan korisnik',
        email: `deleted-${userId}@deleted.invalid`,
        emailVerified: false,
        username: null,
        displayUsername: null,
        image: null,
        twoFactorEnabled: false,
        deletedAt: now,
        deletionScheduledFor: null,
      })
      .where(eq(users.id, userId));
    await tx.insert(auditLog).values({
      actorId: null,
      action: 'account.deleted',
      targetType: 'user',
      targetId: userId,
      details: { deleteContent: user.deletionDeleteContent },
    });
  });
  for (const row of exportKeys)
    if (row.key) await deleteObject(buckets.private, row.key).catch(() => undefined);
  invalidateNoteListings();
  logger.info({ userId }, 'account deleted');
  return true;
}

/** Daily job: deletions whose grace period has ended. */
export async function executeDueDeletions(now = new Date()): Promise<number> {
  const due = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNull(users.deletedAt), lte(users.deletionScheduledFor, now)));
  let done = 0;
  for (const row of due) {
    try {
      if (await executeDeletion(row.id, now)) done += 1;
    } catch (error) {
      logger.error(
        { userId: row.id, err: error instanceof Error ? error.message : String(error) },
        'account deletion failed',
      );
    }
  }
  return done;
}
