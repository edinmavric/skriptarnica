import { Ratelimit } from '@upstash/ratelimit';
import type { Redis } from '@upstash/redis';

import { env } from '@/env';
import { appError, err, ok, type Result } from '@/lib/result';

import { logger } from './logger';
import { redis } from './redis';

/**
 * Rate limits (SPEC §7.1). Downloads are deliberately NOT rate limited (SPEC §4.3) — they are
 * logged in download_events for abuse detection instead.
 */
type Window = Parameters<typeof Ratelimit.slidingWindow>[1];

export const limits = {
  signIn: [10, '10 m'],
  signUp: [5, '1 h'],
  passwordReset: [5, '1 h'],
  sendEmail: [5, '15 m'],
  post: [10, '10 m'],
  comment: [30, '10 m'],
  vote: [120, '1 m'],
  upload: [20, '1 h'],
  search: [60, '1 m'],
  webhook: [300, '1 m'],
  report: [20, '1 h'],
  catalogRequest: [10, '1 d'],
  checkout: [20, '10 m'],
  review: [20, '1 h'],
  linkPreview: [30, '10 m'],
  generic: [60, '1 m'],
} as const satisfies Record<string, readonly [number, Window]>;

export type RateLimitName = keyof typeof limits;

/**
 * @upstash/ratelimit marks its Lua scripts `#!lua flags=allow-key-locking`, a flag only Upstash
 * accepts. Open-source Redis (local and CI, behind serverless-redis-http) rejects those scripts,
 * so off Upstash the flag is dropped before EVAL (the EVALSHA of the flagged script misses and
 * the library falls back to EVAL).
 */
export function portableScripts(client: Redis): Redis {
  const wrapped = Object.create(client) as Redis;
  wrapped.eval = ((script: string, keys: string[], args: unknown[]) =>
    client.eval(
      script.replace(/^#!lua flags=allow-key-locking\n/, '#!lua\n'),
      keys,
      args,
    )) as Redis['eval'];
  return wrapped;
}

const upstashHosted = new URL(env.UPSTASH_REDIS_REST_URL).hostname.endsWith('.upstash.io');
const limiterRedis = upstashHosted ? redis : portableScripts(redis);

const limiters = new Map<RateLimitName, Ratelimit>();

function limiter(name: RateLimitName): Ratelimit {
  let instance = limiters.get(name);
  if (!instance) {
    const [tokens, window] = limits[name];
    instance = new Ratelimit({
      redis: limiterRedis,
      limiter: Ratelimit.slidingWindow(tokens * env.RATE_LIMIT_MULTIPLIER, window),
      prefix: `rl:${name}`,
      analytics: false,
    });
    limiters.set(name, instance);
  }
  return instance;
}

/**
 * Consumes one token for `identifier` (user ID or hashed IP). Fails open if Redis is
 * unreachable, so an outage does not lock everyone out; the failure is logged.
 */
export async function rateLimit(name: RateLimitName, identifier: string): Promise<Result<void>> {
  try {
    const { success } = await limiter(name).limit(identifier);
    return success ? ok(undefined) : err(appError('RATE_LIMITED', 'errors.rateLimited'));
  } catch (error) {
    logger.error(
      { limiter: name, err: error instanceof Error ? error.message : String(error) },
      'rate limiter unavailable',
    );
    return ok(undefined);
  }
}
