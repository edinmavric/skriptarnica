'use server';

import { revalidatePath } from 'next/cache';

import { routes } from '@/config/routes';
import { becomeSellerSchema, payoutDetailsSchema } from '@/lib/validation/seller';

import { becomeSeller, updatePayoutDetails } from '../services/sellers';

import { createAction } from './safe-action';

export const becomeSellerAction = createAction(
  { schema: becomeSellerSchema, auth: 'participant', rateLimit: { name: 'generic', by: 'user' } },
  async (input, { user, ipHash }) => {
    const result = await becomeSeller(user.id, input, ipHash);
    if (!result.ok) return result;
    revalidatePath(routes.sell);
    return { ok: true as const, value: { status: result.value.status } };
  },
);

export const updatePayoutDetailsAction = createAction(
  { schema: payoutDetailsSchema, auth: 'participant', rateLimit: { name: 'generic', by: 'user' } },
  async (input, { user, ipHash }) => updatePayoutDetails(user.id, input, ipHash),
);
