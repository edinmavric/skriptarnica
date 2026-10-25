import { env } from '@/env';

import { logger } from './logger';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function siteverify(
  body: URLSearchParams,
): Promise<{ success?: boolean; 'error-codes'?: string[] }> {
  const response = await fetch(VERIFY_URL, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(8000),
  });
  return (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
}

/**
 * Server-side Cloudflare Turnstile verification (SPEC §7.1). Fails closed. A network error is
 * retried once: a dropped connection to Cloudflare shouldn't cost a real person their sign-up.
 * A "not valid" answer is never retried.
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string,
): Promise<boolean> {
  if (!token) return false;
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: token,
    remoteip: remoteIp,
  });
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const data = await siteverify(body);
      if (!data.success)
        logger.warn({ codes: data['error-codes'] }, 'turnstile verification failed');
      return data.success === true;
    } catch (error) {
      logger.error(
        { attempt, err: error instanceof Error ? error.message : String(error) },
        'turnstile unreachable',
      );
      if (attempt === 2) return false;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}
