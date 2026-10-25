import { describe, expect, it, vi } from 'vitest';

import { logger } from '@/server/logger';
import { limits, rateLimit } from '@/server/rate-limit';

import { uid } from './factories';

// Runs against the local Redis (open-source, behind serverless-redis-http), which rejects the
// Upstash-only script flag unless rate-limit.ts strips it. If that broke, the limiter would
// fail open and every call below would succeed.
describe('rate limits on open-source Redis', () => {
  it('blocks the call after the limit and never falls back to failing open', async () => {
    const errors = vi.spyOn(logger, 'error');
    const identifier = `test:${uid()}`;
    const [tokens] = limits.signUp;
    for (let call = 0; call < tokens; call += 1) {
      expect((await rateLimit('signUp', identifier)).ok).toBe(true);
    }
    const blocked = await rateLimit('signUp', identifier);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('RATE_LIMITED');
    expect((await rateLimit('signUp', `test:${uid()}`)).ok).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
