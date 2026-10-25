import { sql } from 'drizzle-orm';

import { db } from '../db/client';
import { logger } from '../logger';

/**
 * Retention policy (SPEC §7.2; stated in the Privacy Policy): expired sessions and verification
 * tokens go daily; notifications after 12 months; the IP hash on download events after
 * 12 months (the event itself stays for abuse statistics). Audit log and ledger are
 * append-only by design and kept.
 */
export async function runRetention(now = new Date()): Promise<Record<string, number>> {
  const iso = now.toISOString();
  const [sessions, verifications, notifications, downloads] = await Promise.all([
    db.execute(sql`DELETE FROM sessions WHERE expires_at < ${iso}::timestamptz`),
    db.execute(sql`DELETE FROM verifications WHERE expires_at < ${iso}::timestamptz`),
    db.execute(
      sql`DELETE FROM notifications WHERE created_at < ${iso}::timestamptz - interval '12 months'`,
    ),
    db.execute(
      sql`UPDATE download_events SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at < ${iso}::timestamptz - interval '12 months'`,
    ),
  ]);
  const counts = {
    sessions: sessions.count,
    verifications: verifications.count,
    notifications: notifications.count,
    downloadIpHashes: downloads.count,
  };
  logger.info(counts, 'retention cleanup');
  return counts;
}
