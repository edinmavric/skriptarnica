import { logger } from '../logger';

/**
 * ⚖️ E-fiscalization (eFiskalizacija) and invoicing hook (SPEC §5.3.7). Whether and for which
 * amounts the platform must fiscalize is pending legal/accounting review, so the only
 * implementation is a no-op behind the `invoicing` feature flag.
 */
export interface InvoiceService {
  issueForPaidOrder(input: {
    orderId: string;
    totalPara: number;
    commissionPara: number;
  }): Promise<void>;
  issueForRefund(input: { orderId: string; refundId: string; amountPara: number }): Promise<void>;
}

export const noopInvoiceService: InvoiceService = {
  async issueForPaidOrder({ orderId }) {
    logger.debug({ orderId }, 'invoicing disabled (no-op)');
  },
  async issueForRefund({ orderId }) {
    logger.debug({ orderId }, 'invoicing disabled (no-op)');
  },
};

export function getInvoiceService(enabled: boolean): InvoiceService {
  if (enabled) {
    // A fiscalization adapter is added once the legal requirements are confirmed.
    logger.warn('invoicing flag is on but no fiscalization adapter is configured; using no-op');
  }
  return noopInvoiceService;
}
