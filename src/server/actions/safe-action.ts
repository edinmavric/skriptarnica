import * as Sentry from '@sentry/nextjs';
import { unstable_rethrow } from 'next/navigation';
import type { z } from 'zod';

import { appError, err, type AppError, type Result } from '@/lib/result';

import { hasRecentReauth } from '../auth/reauth';
import { getCurrentUser, type CurrentUser } from '../auth/session';
import { logger } from '../logger';
import { canMutate, canParticipate, isAdmin, type PolicyResult } from '../policies';
import { rateLimit, type RateLimitName } from '../rate-limit';
import { clientIpHash } from '../request';

type AuthLevel = 'none' | 'user' | 'participant' | 'admin';

interface ActionContext<A extends AuthLevel> {
  user: A extends 'none' ? CurrentUser | null : CurrentUser;
  ipHash: string;
}

interface ActionOptions<S extends z.ZodType, A extends AuthLevel> {
  schema: S;
  auth: A;
  rateLimit?: { name: RateLimitName; by: 'ip' | 'user' };
  /** Sensitive admin action: needs a password confirmation in the last 10 minutes. */
  reauth?: boolean;
  /** Optional extra policy (e.g. canSell) evaluated after authentication. */
  policy?: (
    user: ActionContext<A>['user'],
    input: z.output<S>,
  ) => PolicyResult | Promise<PolicyResult>;
}

const policyMessage: Record<string, string> = {
  unauthenticated: 'errors.unauthenticated',
  email_not_verified: 'errors.emailNotVerified',
  banned: 'errors.banned',
  impersonating: 'errors.impersonating',
  admin_2fa_required: 'errors.admin2faRequired',
};

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Server Action pipeline (SPEC §2.2): zod parse → auth → policy → rate limit → handler.
 * Always returns a typed Result; unexpected errors are logged, reported and returned as
 * INTERNAL without details. Next.js redirects/notFound are re-thrown.
 */
export function createAction<S extends z.ZodType, A extends AuthLevel, T>(
  options: ActionOptions<S, A>,
  handler: (input: z.output<S>, ctx: ActionContext<A>) => Promise<Result<T>>,
): (raw: z.input<S>) => Promise<Result<T>> {
  return async (raw) => {
    try {
      const parsed = options.schema.safeParse(raw);
      if (!parsed.success) {
        return err(appError('VALIDATION', 'errors.validation', zodFieldErrors(parsed.error)));
      }
      const user = await getCurrentUser();
      if (options.auth !== 'none') {
        const check =
          options.auth === 'admin'
            ? isAdmin(user)
            : options.auth === 'participant'
              ? canParticipate(user)
              : canMutate(user);
        if (!check.allowed) {
          const code: AppError['code'] =
            check.reason === 'unauthenticated' ? 'UNAUTHENTICATED' : 'FORBIDDEN';
          return err(appError(code, policyMessage[check.reason] ?? 'errors.forbidden'));
        }
      }
      const ctx = { user, ipHash: await clientIpHash() } as ActionContext<A>;
      if (options.policy) {
        const check = await options.policy(ctx.user, parsed.data);
        if (!check.allowed) return err(appError('FORBIDDEN', `errors.policy.${check.reason}`));
      }
      if (options.reauth && (!user || !(await hasRecentReauth(user.sessionId)))) {
        return err(appError('FORBIDDEN', 'errors.admin.reauthRequired'));
      }
      if (options.rateLimit) {
        const key = options.rateLimit.by === 'user' && user ? `u:${user.id}` : `ip:${ctx.ipHash}`;
        const limited = await rateLimit(options.rateLimit.name, key);
        if (!limited.ok) return limited;
      }
      return await handler(parsed.data, ctx);
    } catch (error) {
      unstable_rethrow(error);
      logger.error(
        {
          err: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'action failed',
      );
      Sentry.captureException(error);
      return err(appError('INTERNAL', 'errors.internal'));
    }
  };
}
