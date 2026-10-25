'use server';

import { APIError } from 'better-auth/api';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { legalVersions } from '@/config/legal';
import { routes } from '@/config/routes';
import { appError, err, ok, type Result } from '@/lib/result';
import {
  acceptTermsSchema,
  forgotPasswordSchema,
  magicLinkSchema,
  resetPasswordSchema,
  safeNextPath,
  signInSchema,
  signUpSchema,
  twoFactorSchema,
} from '@/lib/validation/auth';

import { createAction } from '../actions/safe-action';
import { db } from '../db/client';
import { consents } from '../db/schema';
import { logger } from '../logger';
import { rateLimit } from '../rate-limit';
import { clientIp } from '../request';
import { verifyTurnstile } from '../turnstile';

import { auth } from './auth';
import { clearFailedSignIns, lockedForSeconds, recordFailedSignIn } from './lockout';
import { getCurrentUser } from './session';

function apiErrorCode(error: unknown): string | null {
  if (error instanceof APIError) {
    const body = error.body as { code?: string; message?: string } | undefined;
    return body?.code ?? body?.message ?? null;
  }
  return null;
}

async function recordConsents(
  userId: string,
  ipHash: string,
  entries: {
    type: 'terms' | 'privacy' | 'age_15' | 'marketing_email';
    version: string;
    value: boolean;
  }[],
) {
  await db
    .insert(consents)
    .values(
      entries.map((entry) => ({
        userId,
        ipHash,
        type: entry.type,
        documentVersion: entry.version,
        value: entry.value,
      })),
    );
}

export const signUpAction = createAction(
  { schema: signUpSchema, auth: 'none', rateLimit: { name: 'signUp', by: 'ip' } },
  async (input, { ipHash }): Promise<Result<{ email: string }>> => {
    if (!(await verifyTurnstile(input.turnstileToken, await clientIp()))) {
      return err(
        appError('VALIDATION', 'errors.captchaFailed', {
          turnstileToken: ['validation.captchaFailed'],
        }),
      );
    }
    try {
      const result = await auth.api.signUpEmail({
        body: {
          name: input.name,
          email: input.email,
          password: input.password,
          username: input.username,
          callbackURL: routes.onboarding,
        },
        headers: await headers(),
      });
      await recordConsents(result.user.id, ipHash, [
        { type: 'terms', version: legalVersions.terms, value: true },
        { type: 'privacy', version: legalVersions.privacy, value: true },
        { type: 'age_15', version: legalVersions.terms, value: true },
        { type: 'marketing_email', version: legalVersions.privacy, value: input.marketingEmails },
      ]);
      logger.info({ userId: result.user.id }, 'user signed up');
      return ok({ email: input.email });
    } catch (error) {
      const code = apiErrorCode(error);
      switch (code) {
        case 'USER_ALREADY_EXISTS':
        case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
          return err(
            appError('CONFLICT', 'errors.emailTaken', { email: ['validation.emailTaken'] }),
          );
        case 'USERNAME_IS_ALREADY_TAKEN':
          return err(
            appError('CONFLICT', 'errors.usernameTaken', {
              username: ['validation.usernameTaken'],
            }),
          );
        case 'INVALID_USERNAME':
        case 'USERNAME_TOO_SHORT':
          return err(
            appError('VALIDATION', 'errors.validation', {
              username: ['validation.usernameInvalid'],
            }),
          );
        case 'PASSWORD_COMPROMISED':
          return err(
            appError('VALIDATION', 'errors.validation', {
              password: ['validation.passwordCompromised'],
            }),
          );
        case 'PASSWORD_TOO_SHORT':
          return err(
            appError('VALIDATION', 'errors.validation', {
              password: ['validation.passwordTooShort'],
            }),
          );
        default:
          throw error;
      }
    }
  },
);

export const signInAction = createAction(
  { schema: signInSchema, auth: 'none', rateLimit: { name: 'signIn', by: 'ip' } },
  async (input): Promise<Result<{ redirectTo: string; twoFactor: boolean }>> => {
    const locked = await lockedForSeconds(input.email);
    if (locked > 0) {
      return err(
        appError('RATE_LIMITED', 'errors.accountLocked', {
          _form: [`errors.accountLocked|${Math.ceil(locked / 60)}`],
        }),
      );
    }
    try {
      const result = await auth.api.signInEmail({
        body: { email: input.email, password: input.password, rememberMe: true },
        headers: await headers(),
      });
      await clearFailedSignIns(input.email);
      const twoFactor = 'twoFactorRedirect' in result && result.twoFactorRedirect === true;
      const next = safeNextPath(input.next);
      return ok({
        twoFactor,
        redirectTo: twoFactor ? `${routes.twoFactor}?next=${encodeURIComponent(next)}` : next,
      });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'INVALID_PASSWORD') {
        const lock = await recordFailedSignIn(input.email);
        if (lock > 0) {
          return err(
            appError('RATE_LIMITED', 'errors.accountLocked', {
              _form: [`errors.accountLocked|${Math.ceil(lock / 60)}`],
            }),
          );
        }
        return err(appError('UNAUTHENTICATED', 'errors.invalidCredentials'));
      }
      throw error;
    }
  },
);

export const magicLinkAction = createAction(
  { schema: magicLinkSchema, auth: 'none', rateLimit: { name: 'sendEmail', by: 'ip' } },
  async (input): Promise<Result<{ sent: true }>> => {
    if (!(await verifyTurnstile(input.turnstileToken, await clientIp()))) {
      return err(
        appError('VALIDATION', 'errors.captchaFailed', {
          turnstileToken: ['validation.captchaFailed'],
        }),
      );
    }
    const perEmail = await rateLimit('sendEmail', `email:${input.email}`);
    if (!perEmail.ok) return perEmail;
    await auth.api.signInMagicLink({
      body: {
        email: input.email,
        callbackURL: safeNextPath(input.next),
        newUserCallbackURL: routes.onboarding,
      },
      headers: await headers(),
    });
    // Same response whether or not the account exists (no account enumeration).
    return ok({ sent: true });
  },
);

export const forgotPasswordAction = createAction(
  { schema: forgotPasswordSchema, auth: 'none', rateLimit: { name: 'passwordReset', by: 'ip' } },
  async (input): Promise<Result<{ sent: true }>> => {
    const perEmail = await rateLimit('passwordReset', `email:${input.email}`);
    if (!perEmail.ok) return perEmail;
    try {
      await auth.api.requestPasswordReset({
        body: { email: input.email, redirectTo: routes.resetPassword },
        headers: await headers(),
      });
    } catch (error) {
      logger.warn({ code: apiErrorCode(error) }, 'password reset request failed');
    }
    return ok({ sent: true });
  },
);

export const resetPasswordAction = createAction(
  { schema: resetPasswordSchema, auth: 'none', rateLimit: { name: 'passwordReset', by: 'ip' } },
  async (input): Promise<Result<{ done: true }>> => {
    try {
      await auth.api.resetPassword({
        body: { token: input.token, newPassword: input.password },
        headers: await headers(),
      });
      return ok({ done: true });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === 'INVALID_TOKEN') return err(appError('VALIDATION', 'errors.resetTokenInvalid'));
      if (code === 'PASSWORD_COMPROMISED') {
        return err(
          appError('VALIDATION', 'errors.validation', {
            password: ['validation.passwordCompromised'],
          }),
        );
      }
      throw error;
    }
  },
);

export const resendVerificationAction = createAction(
  { schema: z.object({}), auth: 'user', rateLimit: { name: 'sendEmail', by: 'user' } },
  async (_input, { user }): Promise<Result<{ sent: true }>> => {
    if (user.emailVerified) return ok({ sent: true });
    await auth.api.sendVerificationEmail({
      body: { email: user.email, callbackURL: routes.onboarding },
      headers: await headers(),
    });
    return ok({ sent: true });
  },
);

export const verifyTwoFactorAction = createAction(
  { schema: twoFactorSchema, auth: 'none', rateLimit: { name: 'signIn', by: 'ip' } },
  async (input): Promise<Result<{ redirectTo: string }>> => {
    try {
      if (/^\d{6}$/.test(input.code)) {
        await auth.api.verifyTOTP({
          body: { code: input.code, trustDevice: input.trustDevice },
          headers: await headers(),
        });
      } else {
        await auth.api.verifyBackupCode({
          body: { code: input.code, trustDevice: input.trustDevice },
          headers: await headers(),
        });
      }
      return ok({ redirectTo: safeNextPath(input.next) });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === 'INVALID_CODE' || code === 'INVALID_BACKUP_CODE') {
        return err(appError('VALIDATION', 'errors.validation', { code: ['validation.codeWrong'] }));
      }
      if (code === 'INVALID_TWO_FACTOR_COOKIE')
        return err(appError('UNAUTHENTICATED', 'errors.twoFactorExpired'));
      if (code === 'TOO_MANY_ATTEMPTS' || code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE') {
        return err(appError('RATE_LIMITED', 'errors.rateLimited'));
      }
      throw error;
    }
  },
);

export const acceptTermsAction = createAction(
  { schema: acceptTermsSchema, auth: 'user' },
  async (input, { user, ipHash }): Promise<Result<{ redirectTo: string }>> => {
    await recordConsents(user.id, ipHash, [
      { type: 'terms', version: legalVersions.terms, value: true },
      { type: 'privacy', version: legalVersions.privacy, value: true },
      { type: 'age_15', version: legalVersions.terms, value: true },
    ]);
    return ok({ redirectTo: safeNextPath(input.next) });
  },
);

/** Signs the current user out and returns to the home page. */
export async function signOutAction(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await auth.api.signOut({ headers: await headers() });
  }
  redirect(routes.home);
}
