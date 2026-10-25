import { makeSignature } from 'better-auth/crypto';
import { cookies } from 'next/headers';

import { env } from '@/env';

import { auth } from './auth';

/** Where the admin's own session cookie waits while they view the site as another user. */
const RETURN_COOKIE = 'skr.admin_return';

const secure = env.NEXT_PUBLIC_APP_URL.startsWith('https://');

async function sessionCookieName(): Promise<string> {
  return (await auth.$context).authCookies.sessionToken.name;
}

/** Swaps the browser to an impersonation session, keeping the admin's cookie to restore later. */
export async function enterImpersonation(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  const name = await sessionCookieName();
  const adminCookie = jar.get(name)?.value;
  if (!adminCookie) throw new Error('no admin session cookie');
  const options = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
  jar.set(RETURN_COOKIE, adminCookie, options);
  jar.set(name, `${token}.${await makeSignature(token, env.BETTER_AUTH_SECRET)}`, options);
}

/** Restores the admin's session. Returns false when there is nothing to return to. */
export async function leaveImpersonation(): Promise<boolean> {
  const jar = await cookies();
  const name = await sessionCookieName();
  const adminCookie = jar.get(RETURN_COOKIE)?.value;
  jar.delete(RETURN_COOKIE);
  if (!adminCookie) {
    jar.delete(name);
    return false;
  }
  jar.set(name, adminCookie, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}
