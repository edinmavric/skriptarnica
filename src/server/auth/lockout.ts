import { createHash } from 'node:crypto';

import { logger } from '../logger';
import { redis } from '../redis';

/**
 * Progressive sign-in lockout per account (SPEC §7.1). After 5 consecutive failures the
 * account is locked for 1 min, doubling with each further failure, capped at 1 hour.
 * Keyed by a hash of the email so Redis never holds addresses.
 */
const FREE_ATTEMPTS = 5;
const BASE_LOCK_SECONDS = 60;
const MAX_LOCK_SECONDS = 60 * 60;
const WINDOW_SECONDS = 24 * 60 * 60;

const keyFor = (email: string) =>
  `lockout:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`;

export function lockSecondsFor(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(BASE_LOCK_SECONDS * 2 ** (failures - FREE_ATTEMPTS), MAX_LOCK_SECONDS);
}

/** Seconds the account is still locked for (0 when not locked). */
export async function lockedForSeconds(email: string): Promise<number> {
  try {
    const until = await redis.hget<number>(keyFor(email), 'until');
    if (!until) return 0;
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'lockout check failed',
    );
    return 0;
  }
}

export async function recordFailedSignIn(email: string): Promise<number> {
  const key = keyFor(email);
  try {
    const failures = await redis.hincrby(key, 'failures', 1);
    const lock = lockSecondsFor(failures);
    if (lock > 0) await redis.hset(key, { until: Date.now() + lock * 1000 });
    await redis.expire(key, WINDOW_SECONDS);
    return lock;
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'lockout record failed',
    );
    return 0;
  }
}

export async function clearFailedSignIns(email: string): Promise<void> {
  try {
    await redis.del(keyFor(email));
  } catch (error) {
    logger.error(
      { err: error instanceof Error ? error.message : String(error) },
      'lockout clear failed',
    );
  }
}
