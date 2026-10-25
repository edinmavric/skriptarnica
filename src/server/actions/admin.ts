'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { approveNote, rejectNote } from '../services/admin/note-review';
import { invalidateNoteListings } from '../services/note-pages';

import { createAction } from './safe-action';

export const approveNoteAction = createAction(
  { schema: z.object({ noteId: z.uuid() }), auth: 'admin' },
  async (input, { user, ipHash }) => {
    const result = await approveNote(user.id, input.noteId, ipHash);
    if (result.ok) {
      invalidateNoteListings();
      revalidatePath('/admin/skripte');
    }
    return result;
  },
);

export const rejectNoteAction = createAction(
  {
    schema: z.object({
      noteId: z.uuid(),
      reason: z.string().trim().min(10, { error: 'validation.reasonTooShort' }).max(1000),
    }),
    auth: 'admin',
  },
  async (input, { user, ipHash }) => {
    const result = await rejectNote(user.id, input.noteId, input.reason, ipHash);
    if (result.ok) revalidatePath('/admin/skripte');
    return result;
  },
);

export const decideRefundAction = createAction(
  {
    schema: z.object({
      refundId: z.uuid(),
      approve: z.boolean(),
      note: z.string().trim().max(1000).nullable(),
    }),
    auth: 'admin',
  },
  async (input, { user, ipHash }) => {
    const { decideRefund } = await import('../services/wallet');
    const result = await decideRefund(user.id, input, ipHash);
    if (result.ok) revalidatePath('/admin/povracaji');
    return result;
  },
);

export const decidePayoutAction = createAction(
  {
    schema: z.discriminatedUnion('kind', [
      z.object({ payoutId: z.uuid(), kind: z.literal('approve') }),
      z.object({
        payoutId: z.uuid(),
        kind: z.literal('paid'),
        bankReference: z
          .string()
          .trim()
          .min(3, { error: 'validation.bankReferenceRequired' })
          .max(100),
      }),
      z.object({
        payoutId: z.uuid(),
        kind: z.literal('reject'),
        reason: z.string().trim().min(5, { error: 'validation.reasonTooShort' }).max(500),
      }),
    ]),
    auth: 'admin',
  },
  async (input, { user, ipHash }) => {
    const { decidePayout } = await import('../services/wallet');
    const decision =
      input.kind === 'approve'
        ? ({ kind: 'approve' } as const)
        : input.kind === 'paid'
          ? ({ kind: 'paid', bankReference: input.bankReference } as const)
          : ({ kind: 'reject', reason: input.reason } as const);
    const result = await decidePayout(user.id, input.payoutId, decision, ipHash);
    if (result.ok) revalidatePath('/admin/isplate');
    return result;
  },
);

export const revealPayoutDetailsAction = createAction(
  { schema: z.object({ payoutId: z.uuid() }), auth: 'admin' },
  async (input, { user, ipHash }) => {
    const { payoutDetailsForAdmin } = await import('../services/admin/money');
    const result = await payoutDetailsForAdmin(user.id, input.payoutId, ipHash);
    if (!result?.details)
      return {
        ok: false as const,
        error: { code: 'NOT_FOUND' as const, messageKey: 'errors.notFound' },
      };
    return { ok: true as const, value: result.details };
  },
);
