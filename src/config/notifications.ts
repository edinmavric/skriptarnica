/** Notification types (SPEC §4.9) and their default channel. */
export const notificationTypes = [
  'sale',
  'review_new',
  'review_reply',
  'note_version',
  'forum_reply',
  'mention',
  'payout_status',
  'moderation',
  'note_decision',
  'catalog_request',
] as const;

export type NotificationType = (typeof notificationTypes)[number];
export type NotificationChannel = 'in_app_email' | 'in_app' | 'none';

/**
 * Community activity defaults to in-app only: it reaches email through the digest instead of
 * one email per reply (SPEC §4.9).
 */
export const defaultChannel: Record<NotificationType, NotificationChannel> = {
  sale: 'in_app_email',
  review_new: 'in_app_email',
  review_reply: 'in_app_email',
  note_version: 'in_app_email',
  forum_reply: 'in_app',
  mention: 'in_app',
  payout_status: 'in_app_email',
  moderation: 'in_app_email',
  note_decision: 'in_app_email',
  catalog_request: 'in_app_email',
};

export const DATA_EXPORT_TTL_DAYS = 7;
export const ACCOUNT_DELETION_GRACE_DAYS = 14;
