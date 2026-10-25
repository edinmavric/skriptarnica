'use server';

import { appError, err } from '@/lib/result';
import { copyrightClaimSchema, counterNoticeSchema } from '@/lib/validation/copyright';

import { clientIp } from '../request';
import { submitCopyrightClaim, submitCounterNotice } from '../services/copyright';
import { verifyTurnstile } from '../turnstile';

import { createAction } from './safe-action';

export const submitCopyrightClaimAction = createAction(
  { schema: copyrightClaimSchema, auth: 'none', rateLimit: { name: 'report', by: 'ip' } },
  async (input) => {
    if (!(await verifyTurnstile(input.turnstileToken, await clientIp())))
      return err(
        appError('VALIDATION', 'errors.validation', {
          turnstileToken: ['validation.captchaFailed'],
        }),
      );
    return submitCopyrightClaim({
      claimantName: input.claimantName,
      claimantEmail: input.claimantEmail,
      organization: input.organization,
      contentUrl: input.contentUrl,
      ownershipProof: input.ownershipProof,
    });
  },
);

export const submitCounterNoticeAction = createAction(
  { schema: counterNoticeSchema, auth: 'participant', rateLimit: { name: 'report', by: 'user' } },
  async (input, { user }) => submitCounterNotice(user.id, input.noteId, input.text),
);
