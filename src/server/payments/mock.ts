import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { env } from '@/env';

import { logger } from '../logger';
import { redis } from '../redis';

import { signPayload, verifySignature } from './signature';
import {
  WebhookVerificationError,
  type CheckoutInput,
  type PaymentEvent,
  type PaymentProvider,
  type PaymentStatus,
} from './types';

/**
 * Mock provider for development and tests (SPEC §5.2). Its "hosted page" is /dev/mock-checkout,
 * which only exists when APP_ENV !== 'production'; env validation forbids this provider there.
 */
export interface MockSession {
  providerRef: string;
  orderId: string;
  amount: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  status: PaymentStatus;
  refunds: { ref: string; amount: number }[];
}

const key = (ref: string) => `mockpay:${ref}`;
const TTL = 7 * 24 * 3600;

export async function getMockSession(ref: string): Promise<MockSession | null> {
  return redis.get<MockSession>(key(ref));
}

async function saveSession(session: MockSession): Promise<void> {
  await redis.set(key(session.providerRef), session, { ex: TTL });
}

const eventSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('payment.succeeded'),
    providerRef: z.string(),
    amountPara: z.number().int(),
    occurredAt: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('payment.failed'),
    providerRef: z.string(),
    reason: z.string(),
    occurredAt: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('payment.cancelled'),
    providerRef: z.string(),
    occurredAt: z.string(),
  }),
  z.object({
    id: z.string(),
    type: z.literal('refund.succeeded'),
    providerRef: z.string(),
    refundRef: z.string(),
    amountPara: z.number().int(),
    occurredAt: z.string(),
  }),
]);

function secret(): string {
  if (!env.MOCK_PAYMENT_WEBHOOK_SECRET) throw new Error('MOCK_PAYMENT_WEBHOOK_SECRET is not set');
  return env.MOCK_PAYMENT_WEBHOOK_SECRET;
}

export function signMockEvent(body: string): string {
  return signPayload(secret(), body);
}

/** Sends a signed webhook for a session, as the real provider would (used by the dev page). */
export async function emitMockEvent(event: Record<string, unknown>): Promise<Response> {
  const body = JSON.stringify(event);
  return fetch(`${env.NEXT_PUBLIC_APP_URL}/api/webhooks/payments/mock`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mock-signature': signMockEvent(body) },
    body,
  });
}

/** Simulates the outcome a buyer picks on the hosted page. */
export async function completeMockSession(
  ref: string,
  outcome: 'succeeded' | 'failed' | 'cancelled',
): Promise<MockSession | null> {
  const session = await getMockSession(ref);
  if (!session || session.status !== 'pending') return session;
  session.status = outcome;
  await saveSession(session);
  const base = {
    id: `evt_${randomUUID()}`,
    providerRef: ref,
    occurredAt: new Date().toISOString(),
  };
  const event =
    outcome === 'succeeded'
      ? { ...base, type: 'payment.succeeded', amountPara: session.amount }
      : outcome === 'failed'
        ? { ...base, type: 'payment.failed', reason: 'card_declined' }
        : { ...base, type: 'payment.cancelled' };
  try {
    const response = await emitMockEvent(event);
    if (!response.ok) logger.warn({ ref, status: response.status }, 'mock webhook not accepted');
  } catch (error) {
    // Like a real provider whose webhook can't reach us: reconciliation picks the payment up.
    logger.warn(
      { ref, err: error instanceof Error ? error.message : String(error) },
      'mock webhook delivery failed',
    );
  }
  return session;
}

export const mockProvider: PaymentProvider = {
  id: 'mock',
  async createCheckout(input: CheckoutInput) {
    const providerRef = `mock_${input.idempotencyKey.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40)}`;
    const existing = await getMockSession(providerRef);
    if (!existing) {
      await saveSession({
        providerRef,
        orderId: input.orderId,
        amount: input.amount,
        description: input.description,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        status: 'pending',
        refunds: [],
      });
    }
    return {
      providerRef,
      redirectUrl: `${env.NEXT_PUBLIC_APP_URL}/dev/mock-checkout?ref=${encodeURIComponent(providerRef)}`,
    };
  },

  async verifyAndParseWebhook(req: Request): Promise<PaymentEvent> {
    const body = await req.text();
    if (!verifySignature(secret(), body, req.headers.get('x-mock-signature'))) {
      throw new WebhookVerificationError('invalid signature');
    }
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new WebhookVerificationError('invalid json');
    }
    const parsed = eventSchema.safeParse(json);
    if (!parsed.success) throw new WebhookVerificationError('invalid payload');
    return { ...parsed.data, occurredAt: new Date(parsed.data.occurredAt) } as PaymentEvent;
  },

  async refund({ providerRef, amount }) {
    const session = await getMockSession(providerRef);
    if (!session || session.status !== 'succeeded')
      return { status: 'failed', providerRefundRef: null };
    const refunded = session.refunds.reduce((sum, r) => sum + r.amount, 0);
    if (refunded + amount > session.amount) return { status: 'failed', providerRefundRef: null };
    const ref = `mockrf_${randomUUID()}`;
    session.refunds.push({ ref, amount });
    await saveSession(session);
    return { status: 'succeeded', providerRefundRef: ref };
  },

  async getStatus(providerRef: string): Promise<PaymentStatus> {
    return (await getMockSession(providerRef))?.status ?? 'pending';
  },
};
