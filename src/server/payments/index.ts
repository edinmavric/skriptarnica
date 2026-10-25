import { env } from '@/env';

import { mockProvider } from './mock';
import type { PaymentProvider } from './types';

/**
 * The configured provider. The production processor (a local RSD card processor with a hosted
 * page, ⚖️ to be chosen with the bank) is added as another adapter class (Phase 11).
 */
export function getPaymentProvider(id: string = env.PAYMENT_PROVIDER): PaymentProvider {
  switch (id) {
    case 'mock':
      return mockProvider;
    default:
      throw new Error(`Unknown payment provider: ${id}`);
  }
}

export type {
  PaymentProvider,
  PaymentEvent,
  PaymentStatus,
  RefundResult,
  CheckoutInput,
} from './types';
export { WebhookVerificationError } from './types';
