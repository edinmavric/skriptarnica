import { z } from 'zod';

import { isValidBankAccount } from '../bank-account';

export const becomeSellerSchema = z.object({
  confirmAdult: z.literal(true, { error: 'validation.adultRequired' }),
  acceptSellerTerms: z.literal(true, { error: 'validation.sellerTermsRequired' }),
  accountHolder: z.string().trim().min(3, { error: 'validation.accountHolderRequired' }).max(120),
  accountNumber: z
    .string()
    .trim()
    .refine(isValidBankAccount, { error: 'validation.bankAccountInvalid' }),
});
export type BecomeSellerInput = z.input<typeof becomeSellerSchema>;

export const payoutDetailsSchema = becomeSellerSchema.pick({
  accountHolder: true,
  accountNumber: true,
});
export type PayoutDetailsInput = z.input<typeof payoutDetailsSchema>;
