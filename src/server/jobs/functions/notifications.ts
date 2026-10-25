import { executeDueDeletions } from '../../services/account-deletion';
import { expireExports, generateExport } from '../../services/data-export';
import { runDigests } from '../../services/digest';
import {
  onForumReply,
  onModerationDecision,
  onNoteDecided,
  onOrderPaid,
  onPayoutStatusChanged,
  onReviewCreated,
  onReviewReplied,
  onVersionPublished,
} from '../../services/notification-events';
import { events, inngest } from '../client';

/** Event → notification functions. Handlers are idempotent, so Inngest retries are safe. */
export const notifyOrderPaid = inngest.createFunction(
  { id: 'notify-order-paid', triggers: [{ event: 'order/paid' }] },
  async ({ event }) => onOrderPaid(events['order/paid'].parse(event.data)),
);
export const notifyReviewCreated = inngest.createFunction(
  { id: 'notify-review-created', triggers: [{ event: 'review/created' }] },
  async ({ event }) => onReviewCreated(events['review/created'].parse(event.data)),
);
export const notifyReviewReplied = inngest.createFunction(
  { id: 'notify-review-replied', triggers: [{ event: 'review/replied' }] },
  async ({ event }) => onReviewReplied(events['review/replied'].parse(event.data)),
);
export const notifyVersionPublished = inngest.createFunction(
  { id: 'notify-version-published', triggers: [{ event: 'note/version.published' }] },
  async ({ event }) => onVersionPublished(events['note/version.published'].parse(event.data)),
);
export const notifyNoteDecided = inngest.createFunction(
  { id: 'notify-note-decided', triggers: [{ event: 'note/decided' }] },
  async ({ event }) => onNoteDecided(events['note/decided'].parse(event.data)),
);
export const notifyPayoutStatus = inngest.createFunction(
  { id: 'notify-payout-status', triggers: [{ event: 'payout/status.changed' }] },
  async ({ event }) => onPayoutStatusChanged(events['payout/status.changed'].parse(event.data)),
);
export const notifyModeration = inngest.createFunction(
  { id: 'notify-moderation', triggers: [{ event: 'moderation/decision' }] },
  async ({ event }) =>
    onModerationDecision(
      events['moderation/decision'].parse(event.data),
      event.id ?? `${event.ts}`,
    ),
);
export const notifyForumReply = inngest.createFunction(
  { id: 'notify-forum-reply', triggers: [{ event: 'forum/reply.created' }] },
  async ({ event }) => onForumReply(events['forum/reply.created'].parse(event.data)),
);

export const buildDataExport = inngest.createFunction(
  { id: 'build-data-export', triggers: [{ event: 'user/export.requested' }], retries: 3 },
  async ({ event }) => generateExport(events['user/export.requested'].parse(event.data).exportId),
);

export const sendDigests = inngest.createFunction(
  { id: 'send-digests', triggers: [{ cron: 'TZ=Europe/Belgrade 0 7 * * *' }] },
  async () => ({ sent: await runDigests() }),
);

/** Daily housekeeping: due account deletions (after the 14-day grace) and expired exports. */
export const accountHousekeeping = inngest.createFunction(
  { id: 'account-housekeeping', triggers: [{ cron: 'TZ=Europe/Belgrade 30 3 * * *' }] },
  async () => ({ deleted: await executeDueDeletions(), exportsExpired: await expireExports() }),
);

export const notificationFunctions = [
  notifyOrderPaid,
  notifyReviewCreated,
  notifyReviewReplied,
  notifyVersionPublished,
  notifyNoteDecided,
  notifyPayoutStatus,
  notifyModeration,
  notifyForumReply,
  buildDataExport,
  sendDigests,
  accountHousekeeping,
];
