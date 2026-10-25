import { z } from 'zod';

export const reviewSchema = z.object({
  orderId: z.uuid(),
  rating: z.number().int().min(1, { error: 'validation.ratingRequired' }).max(5),
  text: z.string().trim().min(10, { error: 'validation.reviewTooShort' }).max(2000),
  passedGrade: z.number().int().min(6).max(10).nullable(),
});
export type ReviewInput = z.input<typeof reviewSchema>;

export const reviewReplySchema = z.object({
  reviewId: z.uuid(),
  text: z.string().trim().min(2, { error: 'validation.replyTooShort' }).max(1000),
});

export const refundRequestSchema = z.object({
  orderId: z.uuid(),
  reason: z.enum(['not_as_described', 'corrupted', 'empty', 'plagiarism', 'other']),
  text: z.string().trim().min(10, { error: 'validation.refundTextTooShort' }).max(2000),
});
export type RefundRequestInput = z.input<typeof refundRequestSchema>;
