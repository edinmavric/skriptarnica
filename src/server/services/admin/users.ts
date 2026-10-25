import { randomBytes } from 'node:crypto';

import { and, count, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';

import { appError, err, ok, type Result } from '@/lib/result';

import { db } from '../../db/client';
import {
  auditLog,
  notes,
  orders,
  reports,
  sellerProfiles,
  sessions,
  studentProfiles,
  twoFactors,
  users,
  faculties,
} from '../../db/schema';
import { audit } from './audit';

export const IMPERSONATION_MINUTES = 30;

export async function searchUsers(query: string, page = 0) {
  const q = query.trim();
  const pattern = `%${q.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
  const where = q
    ? or(
        ilike(users.email, pattern),
        ilike(users.username, pattern),
        ilike(users.name, pattern),
        sql`${users.id}::text = ${q}`,
      )
    : undefined;
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      role: users.role,
      bannedAt: users.bannedAt,
      deletedAt: users.deletedAt,
      twoFactorEnabled: users.twoFactorEnabled,
      createdAt: users.createdAt,
      sellerStatus: sellerProfiles.status,
    })
    .from(users)
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(51)
    .offset(page * 50);
  return { rows: rows.slice(0, 50), hasMore: rows.length > 50 };
}

export async function getUserDetail(userId: string) {
  const [row] = await db
    .select({
      user: users,
      profile: studentProfiles,
      facultyName: faculties.name,
      seller: sellerProfiles,
    })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .leftJoin(faculties, eq(faculties.id, studentProfiles.facultyId))
    .leftJoin(sellerProfiles, eq(sellerProfiles.userId, users.id))
    .where(eq(users.id, userId));
  if (!row) return null;
  const [[orderStats], [noteStats], [reportStats], [sessionStats], history] = await Promise.all([
    db
      .select({ value: count() })
      .from(orders)
      .where(and(eq(orders.buyerId, userId), eq(orders.status, 'paid'))),
    db
      .select({ value: count() })
      .from(notes)
      .where(and(eq(notes.sellerId, userId), isNull(notes.deletedAt))),
    db
      .select({ value: count() })
      .from(reports)
      .where(and(eq(reports.targetType, 'user'), eq(reports.targetId, userId))),
    db
      .select({ value: count() })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), sql`${sessions.expiresAt} > now()`)),
    db
      .select()
      .from(auditLog)
      .where(
        or(
          and(eq(auditLog.targetType, 'user'), eq(auditLog.targetId, userId)),
          eq(auditLog.actorId, userId),
        ),
      )
      .orderBy(desc(auditLog.createdAt))
      .limit(30),
  ]);
  return {
    ...row,
    paidOrders: orderStats?.value ?? 0,
    notes: noteStats?.value ?? 0,
    reportsAgainst: reportStats?.value ?? 0,
    activeSessions: sessionStats?.value ?? 0,
    history,
  };
}

/** Ban: blocks sign-in (session hook) and ends every session. Admins can't be banned here. */
export async function banUser(
  adminId: string,
  userId: string,
  reason: string,
  ipHash: string,
): Promise<Result<void>> {
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target || target.deletedAt) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (target.id === adminId) return err(appError('CONFLICT', 'errors.admin.notSelf'));
  if (target.role === 'admin') return err(appError('CONFLICT', 'errors.admin.notAdmin'));
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ bannedAt: new Date(), banReason: reason })
      .where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, {
      actorId: adminId,
      action: 'user.banned',
      targetType: 'user',
      targetId: userId,
      details: { reason },
      ipHash,
    });
  });
  return ok(undefined);
}

export async function unbanUser(
  adminId: string,
  userId: string,
  ipHash: string,
): Promise<Result<void>> {
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target || !target.bannedAt) return err(appError('NOT_FOUND', 'errors.notFound'));
  await db.transaction(async (tx) => {
    await tx.update(users).set({ bannedAt: null, banReason: null }).where(eq(users.id, userId));
    await audit(tx, {
      actorId: adminId,
      action: 'user.unbanned',
      targetType: 'user',
      targetId: userId,
      ipHash,
    });
  });
  return ok(undefined);
}

/** For a user who lost their authenticator. Ends their sessions; they enroll again after signing in. */
export async function resetTwoFactor(
  adminId: string,
  userId: string,
  ipHash: string,
): Promise<Result<void>> {
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target || target.deletedAt) return err(appError('NOT_FOUND', 'errors.notFound'));
  if (target.id === adminId) return err(appError('CONFLICT', 'errors.admin.notSelf'));
  if (!target.twoFactorEnabled) return err(appError('CONFLICT', 'errors.admin.no2fa'));
  await db.transaction(async (tx) => {
    await tx.delete(twoFactors).where(eq(twoFactors.userId, userId));
    await tx.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await audit(tx, {
      actorId: adminId,
      action: 'user.2fa_reset',
      targetType: 'user',
      targetId: userId,
      ipHash,
    });
  });
  return ok(undefined);
}

/**
 * Read-only impersonation (SPEC §4.10): a short session for the target user marked with
 * `impersonatedBy`. Every mutation policy refuses such sessions; downloads too. Admins and
 * banned/deleted users can't be impersonated.
 */
export async function startImpersonation(
  adminId: string,
  userId: string,
  ipHash: string,
  userAgent: string | null,
): Promise<Result<{ token: string; expiresAt: Date }>> {
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target || target.deletedAt || target.bannedAt)
    return err(appError('NOT_FOUND', 'errors.notFound'));
  if (target.role === 'admin') return err(appError('CONFLICT', 'errors.admin.notAdmin'));
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + IMPERSONATION_MINUTES * 60_000);
  await db.transaction(async (tx) => {
    await tx
      .insert(sessions)
      .values({ token, userId, expiresAt, impersonatedBy: adminId, userAgent });
    await audit(tx, {
      actorId: adminId,
      action: 'user.impersonation_started',
      targetType: 'user',
      targetId: userId,
      details: { minutes: IMPERSONATION_MINUTES },
      ipHash,
    });
  });
  return ok({ token, expiresAt });
}

export async function endImpersonation(token: string): Promise<void> {
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token));
  if (!session?.impersonatedBy) return;
  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.id, session.id));
    await audit(tx, {
      actorId: session.impersonatedBy,
      action: 'user.impersonation_ended',
      targetType: 'user',
      targetId: session.userId,
    });
  });
}
