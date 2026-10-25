import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

import { env } from '@/env';

/**
 * Short-lived signed tokens for email confirmations (e.g. account deletion without a password).
 * Purpose-bound keys derived from the auth secret; the payload is visible, never secret.
 */
function keyFor(purpose: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', env.BETTER_AUTH_SECRET, 'skripta', `signed-token:${purpose}`, 32),
  );
}

export function signToken(
  purpose: string,
  payload: Record<string, string | number | boolean>,
  ttlSeconds: number,
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString('base64url');
  const signature = createHmac('sha256', keyFor(purpose)).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyToken<T extends Record<string, unknown>>(
  purpose: string,
  token: string,
): T | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = Buffer.from(
    createHmac('sha256', keyFor(purpose)).update(body).digest('base64url'),
  );
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as T & { exp?: number };
    if (typeof payload.exp !== 'number' || payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}
