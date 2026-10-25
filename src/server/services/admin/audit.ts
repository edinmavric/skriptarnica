import { db } from '../../db/client';
import { auditLog } from '../../db/schema';
import type { DbOrTx } from '../../db/types';

/** Every admin action is recorded (SPEC §4.10, §3.6). The table is append-only (DB trigger). */
export async function audit(
  tx: DbOrTx,
  entry: {
    actorId: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    details?: Record<string, unknown>;
    ipHash?: string | null;
  },
): Promise<void> {
  await (tx ?? db).insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    details: entry.details ?? {},
    ipHash: entry.ipHash ?? null,
  });
}
