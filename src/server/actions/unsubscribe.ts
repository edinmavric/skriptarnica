'use server';

import { z } from 'zod';

import { appError, err, ok } from '@/lib/result';

import { verifyUnsubscribeToken } from '../email/unsubscribe';
import { applyUnsubscribe } from '../services/unsubscribe';

import { createAction } from './safe-action';

/** Works signed out: the token itself is the authorization (it can only reduce email). */
export const unsubscribeAction = createAction(
  {
    schema: z.object({ token: z.string().min(10).max(500) }),
    auth: 'none',
    rateLimit: { name: 'generic', by: 'ip' },
  },
  async (input) => {
    const parsed = verifyUnsubscribeToken(input.token);
    if (!parsed) return err(appError('VALIDATION', 'errors.unsubscribe.invalid'));
    await applyUnsubscribe(parsed.userId, parsed.scope);
    return ok({ scope: parsed.scope });
  },
);
