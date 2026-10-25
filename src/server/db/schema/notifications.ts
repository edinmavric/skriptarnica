import {
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { notificationTypes } from '@/config/notifications';

import { createdAt, id, timestamps } from './_common';
import { users } from './auth';

export const notificationType = pgEnum('notification_type', notificationTypes);
export const notificationChannel = pgEnum('notification_channel', [
  'in_app_email',
  'in_app',
  'none',
]);
export const digestFrequency = pgEnum('digest_frequency', ['daily', 'weekly', 'none']);

/** In-app notifications (SPEC §4.9). The payload holds what the item needs to render and link. */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationType().notNull(),
    payload: jsonb().$type<Record<string, string | number | null>>().notNull().default({}),
    /** Deduplicates retried jobs: one notification per (user, key). */
    dedupeKey: text().notNull(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('notifications_dedupe_uq').on(t.userId, t.dedupeKey),
    index('notifications_user_idx').on(t.userId, t.createdAt),
  ],
);

/** Per-type channel; a missing row means the type's default (config/notifications). */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationType().notNull(),
    channel: notificationChannel().notNull(),
    ...timestamps(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

export const notificationSettings = pgTable('notification_settings', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  digest: digestFrequency().notNull().default('weekly'),
  lastDigestAt: timestamp({ withTimezone: true }),
  ...timestamps(),
});

export const followTarget = pgEnum('follow_target', ['seller', 'community']);

/** Following a seller or a community (SPEC §3.6). */
export const follows = pgTable(
  'follows',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: followTarget().notNull(),
    targetId: uuid().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
    index('follows_target_idx').on(t.targetType, t.targetId),
  ],
);

export const dataExportStatus = pgEnum('data_export_status', [
  'pending',
  'ready',
  'failed',
  'expired',
]);

/** Personal data exports (SPEC §4.8): a zip built by a job, downloadable by the owner for 7 days. */
export const dataExports = pgTable(
  'data_exports',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: dataExportStatus().notNull().default('pending'),
    storageKey: text(),
    sizeBytes: integer(),
    readyAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    downloaded: boolean().notNull().default(false),
    ...timestamps(),
  },
  (t) => [index('data_exports_user_idx').on(t.userId, t.createdAt)],
);
