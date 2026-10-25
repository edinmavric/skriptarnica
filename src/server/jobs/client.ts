import { Inngest } from 'inngest';
import { z } from 'zod';

import { env } from '@/env';

import { logger } from '../logger';

/** Background jobs (SPEC §2): PDF processing, emails, payouts, digests. */
export const inngest = new Inngest({
  id: 'skripta',
  isDev: env.INNGEST_DEV,
  ...(env.INNGEST_EVENT_KEY ? { eventKey: env.INNGEST_EVENT_KEY } : {}),
  ...(env.INNGEST_SIGNING_KEY ? { signingKey: env.INNGEST_SIGNING_KEY } : {}),
});

/** Event payload schemas; handlers parse with these so bad payloads fail loudly. */
export const events = {
  'note/version.uploaded': z.object({ versionId: z.uuid() }),
  'note/version.published': z.object({
    noteId: z.uuid(),
    versionId: z.uuid(),
    versionNumber: z.number().int(),
  }),
  'note/decided': z.object({
    noteId: z.uuid(),
    decision: z.enum(['approved', 'rejected']),
    reason: z.string().nullable(),
  }),
  'order/paid': z.object({ orderId: z.uuid() }),
  'order/refunded': z.object({ orderId: z.uuid(), refundId: z.uuid() }),
  'review/created': z.object({ reviewId: z.uuid() }),
  'review/replied': z.object({ reviewId: z.uuid() }),
  'payout/status.changed': z.object({ payoutId: z.uuid() }),
  'forum/reply.created': z.object({ kind: z.enum(['post', 'comment']), id: z.uuid() }),
  'moderation/decision': z.object({
    userId: z.uuid(),
    targetType: z.string(),
    action: z.string(),
    reason: z.string().nullable(),
    communityId: z.uuid().nullable().optional(),
  }),
  'catalog/request.decided': z.object({ requestId: z.uuid() }),
  'user/export.requested': z.object({ userId: z.uuid(), exportId: z.uuid() }),
  'user/deletion.requested': z.object({ userId: z.uuid() }),
} as const;

export type EventName = keyof typeof events;
export type EventData<N extends EventName> = z.infer<(typeof events)[N]>;

/**
 * Sends an event. Failures are logged and re-thrown so the caller's action fails visibly
 * (callers that must not fail use `trySendEvent`).
 */
export async function sendEvent<N extends EventName>(
  name: N,
  data: EventData<N>,
  idempotencyId?: string,
): Promise<void> {
  events[name].parse(data);
  await inngest.send({ name, data, ...(idempotencyId ? { id: idempotencyId } : {}) });
}

export async function trySendEvent<N extends EventName>(
  name: N,
  data: EventData<N>,
  idempotencyId?: string,
): Promise<boolean> {
  try {
    await sendEvent(name, data, idempotencyId);
    return true;
  } catch (error) {
    logger.error(
      { event: name, err: error instanceof Error ? error.message : String(error) },
      'event send failed',
    );
    return false;
  }
}
