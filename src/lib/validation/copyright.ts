import { z } from 'zod';

export const copyrightClaimSchema = z.object({
  claimantName: z.string().trim().min(3, { error: 'validation.nameTooShort' }).max(200),
  claimantEmail: z.email({ error: 'validation.emailInvalid' }).max(200),
  organization: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || null),
  contentUrl: z.url({ error: 'validation.urlRequired' }).max(500),
  ownershipProof: z.string().trim().min(30, { error: 'validation.proofTooShort' }).max(5000),
  statement: z.literal(true, { error: 'validation.statementRequired' }),
  turnstileToken: z.string().min(1, { error: 'validation.captchaRequired' }),
});
export type CopyrightClaimInput = z.input<typeof copyrightClaimSchema>;

export const counterNoticeSchema = z.object({
  noteId: z.uuid(),
  text: z.string().trim().min(50, { error: 'validation.counterTooShort' }).max(5000),
  statement: z.literal(true, { error: 'validation.statementRequired' }),
});
