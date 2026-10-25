'use server';

import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { z } from 'zod';

import { appError, err, ok, type Result } from '@/lib/result';

import { auth } from '../auth/auth';
import { db } from '../db/client';
import { auditLog } from '../db/schema';

import { createAction } from './safe-action';

const passwordSchema = z.object({
  password: z.string().min(1, { error: 'validation.passwordRequired' }),
});

function code(error: unknown): string | null {
  return error instanceof APIError
    ? ((error.body as { code?: string } | undefined)?.code ?? null)
    : null;
}

/** Starts TOTP enrollment (needs the password). 2FA turns on only after a code is verified. */
export const startTwoFactorAction = createAction(
  { schema: passwordSchema, auth: 'user', rateLimit: { name: 'signIn', by: 'user' } },
  async (input): Promise<Result<{ qrSvg: string; secret: string; backupCodes: string[] }>> => {
    try {
      const result = await auth.api.enableTwoFactor({
        body: { password: input.password },
        headers: await headers(),
      });
      if (result.method !== 'totp') return err(appError('INTERNAL', 'errors.internal'));
      const secret = new URL(result.totpURI).searchParams.get('secret') ?? '';
      const qrSvg = await QRCode.toString(result.totpURI, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
      });
      return ok({ qrSvg, secret, backupCodes: result.backupCodes });
    } catch (error) {
      if (code(error) === 'INVALID_PASSWORD')
        return err(
          appError('VALIDATION', 'errors.validation', { password: ['validation.passwordWrong'] }),
        );
      throw error;
    }
  },
);

export const confirmTwoFactorAction = createAction(
  {
    schema: z.object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, { error: 'validation.codeInvalid' }),
    }),
    auth: 'user',
  },
  async (input, { user, ipHash }): Promise<Result<void>> => {
    try {
      await auth.api.verifyTOTP({ body: { code: input.code }, headers: await headers() });
      await db
        .insert(auditLog)
        .values({
          actorId: user.id,
          action: 'security.2fa_enabled',
          targetType: 'user',
          targetId: user.id,
          ipHash,
        });
      return ok(undefined);
    } catch (error) {
      if (code(error) === 'INVALID_CODE')
        return err(appError('VALIDATION', 'errors.validation', { code: ['validation.codeWrong'] }));
      throw error;
    }
  },
);

export const disableTwoFactorAction = createAction(
  { schema: passwordSchema, auth: 'user', rateLimit: { name: 'signIn', by: 'user' } },
  async (input, { user, ipHash }): Promise<Result<void>> => {
    if (user.role === 'admin') return err(appError('FORBIDDEN', 'errors.admin2faRequired'));
    try {
      await auth.api.disableTwoFactor({
        body: { password: input.password },
        headers: await headers(),
      });
      await db
        .insert(auditLog)
        .values({
          actorId: user.id,
          action: 'security.2fa_disabled',
          targetType: 'user',
          targetId: user.id,
          ipHash,
        });
      return ok(undefined);
    } catch (error) {
      if (code(error) === 'INVALID_PASSWORD')
        return err(
          appError('VALIDATION', 'errors.validation', { password: ['validation.passwordWrong'] }),
        );
      throw error;
    }
  },
);
