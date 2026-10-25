import { NextResponse, type NextRequest } from 'next/server';

import { alertOps } from '@/server/jobs/alerts';
import { logger } from '@/server/logger';
import { getPaymentProvider, WebhookVerificationError } from '@/server/payments';
import { rateLimit } from '@/server/rate-limit';
import { hashIp } from '@/server/request';
import { AmountMismatchError, handlePaymentEvent } from '@/server/services/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Payment webhooks (SPEC §5.3.3). Signature verified by the provider adapter; processing is
 * idempotent per event id. 4xx for unverifiable requests, 5xx so the provider retries on our
 * failures.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: providerId } = await params;
  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    '0.0.0.0';
  const limited = await rateLimit('webhook', `ip:${hashIp(ip)}`);
  if (!limited.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  let provider;
  try {
    provider = getPaymentProvider(providerId);
  } catch {
    return NextResponse.json({ error: 'unknown_provider' }, { status: 404 });
  }

  let event;
  try {
    event = await provider.verifyAndParseWebhook(request);
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      logger.warn({ provider: providerId, reason: error.message }, 'webhook rejected');
      return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
    }
    throw error;
  }

  try {
    const outcome = await handlePaymentEvent(providerId, event);
    logger.info(
      { provider: providerId, eventId: event.id, type: event.type, outcome },
      'webhook processed',
    );
    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    if (error instanceof AmountMismatchError) {
      await alertOps('Payment amount mismatch', error.message);
      return NextResponse.json({ error: 'amount_mismatch' }, { status: 422 });
    }
    logger.error(
      {
        provider: providerId,
        eventId: event.id,
        err: error instanceof Error ? error.message : String(error),
      },
      'webhook processing failed',
    );
    await alertOps(
      'Payment webhook failed',
      `${providerId} ${event.id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }
}
