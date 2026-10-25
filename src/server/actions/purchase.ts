'use server';

import { z } from 'zod';

import { PARA_PER_RSD } from '@/config/constants';
import { ok } from '@/lib/result';
import { createOrderSchema, payoutRequestSchema } from '@/lib/validation/purchase';
import { refundRequestSchema, reviewReplySchema, reviewSchema } from '@/lib/validation/reviews';

import { createOrder, getOrderForBuyer } from '../services/orders';
import { createReview, replyToReview } from '../services/reviews';
import { requestPayout, requestRefund } from '../services/wallet';

import { createAction } from './safe-action';

export const createOrderAction = createAction(
  { schema: createOrderSchema, auth: 'participant', rateLimit: { name: 'checkout', by: 'user' } },
  async (input, { user }) => createOrder(user, input),
);

export const orderStatusAction = createAction(
  { schema: z.object({ orderId: z.uuid() }), auth: 'user' },
  async (input, { user }) => {
    const row = await getOrderForBuyer(user.id, input.orderId);
    return ok(row ? { status: row.order.status, noteSlug: row.noteSlug } : null);
  },
);

export const createReviewAction = createAction(
  { schema: reviewSchema, auth: 'participant', rateLimit: { name: 'review', by: 'user' } },
  async (input, { user }) =>
    createReview(user.id, { ...input, passedGrade: input.passedGrade ?? null }),
);

export const replyToReviewAction = createAction(
  { schema: reviewReplySchema, auth: 'participant', rateLimit: { name: 'review', by: 'user' } },
  async (input, { user }) => replyToReview(user.id, input.reviewId, input.text),
);

export const requestRefundAction = createAction(
  { schema: refundRequestSchema, auth: 'participant', rateLimit: { name: 'report', by: 'user' } },
  async (input, { user }) => requestRefund(user.id, input),
);

export const requestPayoutAction = createAction(
  { schema: payoutRequestSchema, auth: 'participant', rateLimit: { name: 'generic', by: 'user' } },
  async (input, { user }) => requestPayout(user.id, input.amountRsd * PARA_PER_RSD),
);
