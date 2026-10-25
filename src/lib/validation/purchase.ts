import { z } from 'zod';

export const createOrderSchema = z.object({
  noteId: z.uuid(),
  idempotencyKey: z.uuid(),
  withdrawalWaiver: z.literal(true, { error: 'validation.withdrawalWaiverRequired' }),
});
export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const payoutRequestSchema = z.object({
  amountRsd: z
    .number({ error: 'validation.priceInvalid' })
    .int({ error: 'validation.priceWhole' })
    .positive({ error: 'validation.priceInvalid' }),
});
