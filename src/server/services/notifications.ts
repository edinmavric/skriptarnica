import { and, count, desc, eq, inArray, isNull, lt } from 'drizzle-orm';

import {
  defaultChannel,
  notificationTypes,
  type NotificationChannel,
  type NotificationType,
} from '@/config/notifications';
import { env } from '@/env';

import { db } from '../db/client';
import { notificationPreferences, notifications, notificationSettings, users } from '../db/schema';
import { emailTranslator } from '../email/i18n';
import { sendNotificationEmail } from '../email/send';
import { logger } from '../logger';

export type NotificationPayload = Record<string, string | number | null> & { href: string };

export interface NotificationView {
  id: string;
  type: NotificationType;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

export async function getPreferences(
  userId: string,
): Promise<Record<NotificationType, NotificationChannel>> {
  const rows = await db
    .select({ type: notificationPreferences.type, channel: notificationPreferences.channel })
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  const saved = new Map(rows.map((row) => [row.type, row.channel]));
  return Object.fromEntries(
    notificationTypes.map((type) => [type, saved.get(type) ?? defaultChannel[type]]),
  ) as Record<NotificationType, NotificationChannel>;
}

export async function setPreference(
  userId: string,
  type: NotificationType,
  channel: NotificationChannel,
) {
  await db
    .insert(notificationPreferences)
    .values({ userId, type, channel })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.type],
      set: { channel },
    });
}

export async function getDigestFrequency(userId: string): Promise<'daily' | 'weekly' | 'none'> {
  const [row] = await db
    .select({ digest: notificationSettings.digest })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId));
  return row?.digest ?? 'weekly';
}

export async function setDigestFrequency(userId: string, digest: 'daily' | 'weekly' | 'none') {
  await db
    .insert(notificationSettings)
    .values({ userId, digest })
    .onConflictDoUpdate({ target: notificationSettings.userId, set: { digest } });
}

/**
 * Creates an in-app notification and, if the user's channel for the type includes email, sends
 * it. Idempotent per (user, dedupeKey), so retried jobs never notify twice. Deleted and banned
 * users get nothing.
 */
export async function notify(input: {
  userId: string;
  type: NotificationType;
  dedupeKey: string;
  payload: NotificationPayload;
  /** Values for the email copy (actor names resolved, amounts formatted). */
  emailValues?: Record<string, string | number>;
}): Promise<boolean> {
  const [user] = await db
    .select({ email: users.email, deletedAt: users.deletedAt, bannedAt: users.bannedAt })
    .from(users)
    .where(eq(users.id, input.userId));
  if (!user || user.deletedAt || user.bannedAt) return false;
  const channel = (await getPreferences(input.userId))[input.type];
  if (channel === 'none') return false;
  const inserted = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      type: input.type,
      dedupeKey: input.dedupeKey,
      payload: input.payload,
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  if (inserted.length === 0) return false;
  if (channel === 'in_app_email') {
    try {
      await sendNotificationEmail({
        to: user.email,
        userId: input.userId,
        type: input.type,
        values: input.emailValues ?? stringValues(input.payload),
        url: `${env.NEXT_PUBLIC_APP_URL}${input.payload.href}`,
      });
    } catch (error) {
      // The in-app notification stands; email delivery problems are alerted on separately.
      logger.error(
        { type: input.type, err: error instanceof Error ? error.message : String(error) },
        'notification email failed',
      );
    }
  }
  return true;
}

/** Email copy values; an anonymous actor (null) becomes "Anonimni korisnik". */
function stringValues(payload: NotificationPayload): Record<string, string | number> {
  const anonymous = emailTranslator()('common.anonymousActor');
  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      value ?? (key === 'actor' ? anonymous : ''),
    ]),
  );
}

const PAGE_SIZE = 30;

export async function listNotifications(
  userId: string,
  before?: string,
): Promise<{ items: NotificationView[]; nextCursor: string | null }> {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        before ? lt(notifications.createdAt, new Date(before)) : undefined,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);
  return {
    items: page.map((row) => ({
      id: row.id,
      type: row.type,
      payload: row.payload as NotificationPayload,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor: rows.length > PAGE_SIZE ? (page.at(-1)?.createdAt.toISOString() ?? null) : null,
  };
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

/** Marks some (or all) of the user's notifications as read; other users' IDs are ignored. */
export async function markRead(userId: string, ids: string[] | 'all'): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        ids === 'all'
          ? undefined
          : inArray(
              notifications.id,
              ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'],
            ),
      ),
    );
}
