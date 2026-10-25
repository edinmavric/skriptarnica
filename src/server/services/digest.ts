import { sql } from 'drizzle-orm';

import { routes } from '@/config/routes';
import { env } from '@/env';

import { db } from '../db/client';
import { notificationSettings } from '../db/schema';
import { emailTranslator } from '../email/i18n';
import { sendDigestEmail } from '../email/send';
import { logger } from '../logger';
import { unreadCount } from './notifications';

const DAY = 86_400_000;

/** Monday in Belgrade (weekly digests go out then). */
export function isBelgradeMonday(now: Date): boolean {
  return (
    new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'Europe/Belgrade' }).format(
      now,
    ) === 'Mon'
  );
}

/**
 * Community activity digest (SPEC §4.9): the most active new posts from the user's communities
 * since the last digest, never their own. Users without a settings row get the weekly default.
 * Nothing is sent when there is nothing new.
 */
export async function runDigests(now = new Date(), onlyUserId?: string): Promise<number> {
  const frequencies = isBelgradeMonday(now) ? ['daily', 'weekly'] : ['daily'];
  const recipients = await db.execute<{
    id: string;
    email: string;
    digest: 'daily' | 'weekly';
    last: Date | string | null;
  }>(sql`
    SELECT u.id, u.email, coalesce(s.digest, 'weekly') AS digest, s.last_digest_at AS last
    FROM users u
    LEFT JOIN notification_settings s ON s.user_id = u.id
    WHERE u.deleted_at IS NULL AND u.banned_at IS NULL AND u.email_verified
      AND coalesce(s.digest, 'weekly') IN ${sql.raw(`(${frequencies.map((f) => `'${f}'`).join(',')})`)}
      AND EXISTS (SELECT 1 FROM community_members m WHERE m.user_id = u.id AND (m.banned_until IS NULL OR m.banned_until < now()))
      ${onlyUserId ? sql`AND u.id = ${onlyUserId}` : sql``}`);
  const t = emailTranslator();
  let sent = 0;
  for (const recipient of recipients) {
    const period = recipient.digest === 'daily' ? DAY : 7 * DAY;
    const since = recipient.last ? new Date(recipient.last) : new Date(now.getTime() - period);
    const rows = await db.execute<{
      id: string;
      title: string;
      slug: string;
      community: string;
      community_name: string;
      comments: number;
    }>(sql`
      SELECT p.id, p.title, p.slug, c.slug AS community, c.name AS community_name, p.comment_count AS comments
      FROM posts p
      JOIN communities c ON c.id = p.community_id
      JOIN community_members m ON m.community_id = p.community_id AND m.user_id = ${recipient.id}
      WHERE p.created_at > ${since.toISOString()}::timestamptz AND p.created_at <= ${now.toISOString()}::timestamptz
        AND p.removed_at IS NULL AND p.deleted_at IS NULL AND p.author_id <> ${recipient.id}
      ORDER BY p.score + p.comment_count DESC, p.created_at DESC
      LIMIT 8`);
    if (rows.length === 0) continue;
    try {
      await sendDigestEmail({
        to: recipient.email,
        userId: recipient.id,
        frequency: recipient.digest,
        unread: await unreadCount(recipient.id),
        items: rows.map((row) => ({
          title: row.title,
          community: row.community_name,
          comments: t('digest.comments', { count: Number(row.comments) }),
          url: `${env.NEXT_PUBLIC_APP_URL}${routes.post(row.community, row.id, row.slug)}`,
        })),
      });
      await db
        .insert(notificationSettings)
        .values({ userId: recipient.id, lastDigestAt: now })
        .onConflictDoUpdate({ target: notificationSettings.userId, set: { lastDigestAt: now } });
      sent += 1;
    } catch (error) {
      logger.error(
        { err: error instanceof Error ? error.message : String(error) },
        'digest send failed',
      );
    }
  }
  return sent;
}
