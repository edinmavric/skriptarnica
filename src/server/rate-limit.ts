import { Ratelimit } from '@upstash/ratelimit';

import { appError, err, ok, type Result } from '@/lib/result';

import { logger } from './logger';
import { redis } from './redis';

/**
 * Rate limits (SPEC §7.1). Downloads are deliberately NOT rate limited (SPEC §4.3) — they are
 * logged in download_events for abuse detection instead.
 */
const limits = {
  signIn: Ratelimit.slidingWindow(10, '10 m'),
  signUp: Ratelimit.slidingWindow(5, '1 h'),
  passwordReset: Ratelimit.slidingWindow(5, '1 h'),
  sendEmail: Ratelimit.slidingWindow(5, '15 m'),
  post: Ratelimit.slidingWindow(10, '10 m'),
  comment: Ratelimit.slidingWindow(30, '10 m'),
  vote: Ratelimit.slidingWindow(120, '1 m'),
  upload: Ratelimit.slidingWindow(20, '1 h'),
  search: Ratelimit.slidingWindow(60, '1 m'),
  webhook: Ratelimit.slidingWindow(300, '1 m'),
  report: Ratelimit.slidingWindow(20, '1 h'),
  catalogRequest: Ratelimit.slidingWindow(10, '1 d'),
  checkout: Ratelimit.slidingWindow(20, '10 m'),
  review: Ratelimit.slidingWindow(20, '1 h'),
  linkPreview: Ratelimit.slidingWindow(30, '10 m'),
  generic: Ratelimit.slidingWindow(60, '1 m'),
} as const;

export type RateLimitName = keyof typeof limits;

const limiters = new Map<RateLimitName, Ratelimit>();

function limiter(name: RateLimitName): Ratelimit {
  let instance = limiters.get(name);
  if (!instance) {
    instance = new Ratelimit({
      redis,
      limiter: limits[name],
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
