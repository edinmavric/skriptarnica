import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

import { notificationTypes, type NotificationType } from '@/config/notifications';
import { env } from '@/env';

/** What a link unsubscribes from: one notification type's emails, or the digest. */
export type UnsubscribeScope = NotificationType | 'digest';

const scopes = new Set<string>([...notificationTypes, 'digest']);

// A purpose-bound key derived from the auth secret, so no extra secret is needed and the
// token can't be confused with any other signature.
const key = Buffer.from(
  hkdfSync('sha256', env.BETTER_AUTH_SECRET, 'skripta', 'unsubscribe-v1', 32),
);

function sign(body: string): string {
  return createHmac('sha256', key).update(body).digest('base64url');
}

/** Stateless one-click unsubscribe token (RFC 8058). It never expires; it can only lower email volume. */
export function unsubscribeToken(userId: string, scope: UnsubscribeScope): string {
  const body = Buffer.from(`${userId}:${scope}`).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyUnsubscribeToken(
  token: string,
): { userId: string; scope: UnsubscribeScope } | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [userId, scope] = Buffer.from(body, 'base64url').toString().split(':');
  if (!userId || !scope || !scopes.has(scope) || !/^[0-9a-f-]{36}$/.test(userId)) return null;
  return { userId, scope: scope as UnsubscribeScope };
}

export function unsubscribeUrls(userId: string, scope: UnsubscribeScope) {
  const token = unsubscribeToken(userId, scope);
  return {
    /** Human page (GET shows a confirm button; link scanners can't unsubscribe anyone). */
    page: `${env.NEXT_PUBLIC_APP_URL}/odjava?t=${token}`,
    /** RFC 8058 one-click endpoint (POST). */
    oneClick: `${env.NEXT_PUBLIC_APP_URL}/api/odjava?t=${token}`,
  };
}

export function listUnsubscribeHeaders(
  userId: string,
  scope: UnsubscribeScope,
): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubscribeUrls(userId, scope).oneClick}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}
