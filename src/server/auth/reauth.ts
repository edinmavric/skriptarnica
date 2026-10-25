import { redis } from '../redis';

/**
 * Step-up re-authentication for sensitive admin actions (SPEC §4.10): after the admin confirms
 * their password, the current session may perform them for 10 minutes. Bound to the session, so
 * a stolen cookie from another session doesn't inherit it.
 */
export const REAUTH_TTL_SECONDS = 10 * 60;

const key = (sessionId: string) => `reauth:${sessionId}`;

export async function markReauthenticated(sessionId: string): Promise<void> {
  await redis.set(key(sessionId), '1', { ex: REAUTH_TTL_SECONDS });
}

export async function hasRecentReauth(sessionId: string): Promise<boolean> {
  return (await redis.get(key(sessionId))) !== null;
}
