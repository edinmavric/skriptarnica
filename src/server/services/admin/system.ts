import { and, desc, eq, ilike, lt } from 'drizzle-orm';

import { appError, err, ok, type Result } from '@/lib/result';

import { db } from '../../db/client';
import { auditLog, users } from '../../db/schema';
import { getSettings, saveSettings, settingsSchema, type PlatformSettings } from '../settings';
import { audit } from './audit';

/** Settings change with a before/after diff in the audit log (SPEC §4.10). */
export async function updatePlatformSettings(
  adminId: string,
  next: PlatformSettings,
  ipHash: string,
): Promise<Result<void>> {
  const parsed = settingsSchema.safeParse(next);
  if (!parsed.success) return err(appError('VALIDATION', 'errors.validation'));
  const before = await getSettings();
  const changes = Object.fromEntries(
    Object.entries(parsed.data)
      .filter(
        ([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(before[key as keyof PlatformSettings]),
      )
      .map(([key, value]) => [key, { from: before[key as keyof PlatformSettings], to: value }]),
  );
  if (Object.keys(changes).length === 0) return ok(undefined);
  await db.transaction(async (tx) => {
    await saveSettings(tx, parsed.data, adminId);
    await audit(tx, {
      actorId: adminId,
      action: 'settings.updated',
      targetType: 'settings',
      targetId: 'platform',
      details: changes,
      ipHash,
    });
  });
  return ok(undefined);
}

export async function listAuditLog(input: {
  action?: string;
  actor?: string;
  target?: string;
  before?: string;
}) {
  const rows = await db
    .select({ entry: auditLog, actorName: users.username, actorEmail: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(
      and(
        input.action
          ? ilike(auditLog.action, `${input.action.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
          : undefined,
        input.actor ? ilike(users.email, `%${input.actor}%`) : undefined,
        input.target ? eq(auditLog.targetId, input.target) : undefined,
        input.before ? lt(auditLog.createdAt, new Date(input.before)) : undefined,
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(51);
  return {
    rows: rows.slice(0, 50),
    nextCursor: rows.length > 50 ? (rows[49]?.entry.createdAt.toISOString() ?? null) : null,
  };
}
