'use server';

import { redirect } from 'next/navigation';

import { devRoutesEnabled } from '@/lib/dev';
import { completeMockSession } from '@/server/payments/mock';

/** Dev-only: the buyer's choice on the mock hosted page; sends the signed webhook. */
export async function completeMockPaymentAction(formData: FormData): Promise<void> {
  if (!devRoutesEnabled()) throw new Error('not available');
  const ref = String(formData.get('ref') ?? '');
  const outcome = String(formData.get('outcome') ?? '');
  if (!['succeeded', 'failed', 'cancelled'].includes(outcome)) throw new Error('bad outcome');
  const session = await completeMockSession(ref, outcome as 'succeeded' | 'failed' | 'cancelled');
  if (!session) throw new Error('unknown session');
  redirect(
    outcome === 'succeeded'
      ? session.successUrl
      : outcome === 'failed'
        ? session.successUrl
        : session.cancelUrl,
  );
}
