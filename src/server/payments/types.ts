/**
 * Payment provider adapter (SPEC §5.2). Card data never touches the app: providers expose a
 * hosted payment page and notify us through signed webhooks.
 */
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';

export type PaymentEvent =
  | {
      id: string;
      type: 'payment.succeeded';
      providerRef: string;
      amountPara: number;
      occurredAt: Date;
    }
  | { id: string; type: 'payment.failed'; providerRef: string; reason: string; occurredAt: Date }
  | { id: string; type: 'payment.cancelled'; providerRef: string; occurredAt: Date }
  | {
      id: string;
      type: 'refund.succeeded';
      providerRef: string;
      refundRef: string;
      amountPara: number;
      occurredAt: Date;
    };

export interface RefundResult {
  status: 'succeeded' | 'pending' | 'failed';
  providerRefundRef: string | null;
}

export interface CheckoutInput {
  orderId: string;
  /** Integer para. */
  amount: number;
  currency: 'RSD';
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}

export interface PaymentProvider {
  id: 'mock' | (string & {});
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef: string }>;
  /** Verifies the signature and parses the event; throws WebhookVerificationError otherwise. */
  verifyAndParseWebhook(req: Request): Promise<PaymentEvent>;
  refund(input: { providerRef: string; amount: number; reason: string }): Promise<RefundResult>;
  /** For reconciliation of pending orders (SPEC §5.3.5). */
  getStatus(providerRef: string): Promise<PaymentStatus>;
}

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
  }
}
