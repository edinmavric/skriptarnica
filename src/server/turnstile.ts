import { env } from '@/env';

import { logger } from './logger';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Server-side Cloudflare Turnstile verification (SPEC §7.1). Fails closed. */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string,
): Promise<boolean> {
  if (!token) return false;
  try {
    const body = new URLSearchParams({
      secret: env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: remoteIp,
    });
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(8000),
    });
    const data = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!data.success) logger.warn({ codes: data['error-codes'] }, 'turnstile verification failed');
    return data.success === true;
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'turnstile unreachable',
    );
    return false;
  }
}
