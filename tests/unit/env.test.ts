import { describe, expect, it } from 'vitest';

import { InvalidEnvError, parseEnv } from '@/env';

const validServerEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://user:pass@localhost:5433/db',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};

describe('parseEnv', () => {
  it('accepts a minimal valid server environment', () => {
    const env = parseEnv(validServerEnv, { isServer: true });
    expect(env.DATABASE_URL).toBe(validServerEnv.DATABASE_URL);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('rejects a missing DATABASE_URL on the server', () => {
    const { DATABASE_URL: _omitted, ...rest } = validServerEnv;
    expect(() => parseEnv(rest, { isServer: true })).toThrow(InvalidEnvError);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() =>
      parseEnv({ ...validServerEnv, DATABASE_URL: 'mysql://localhost/db' }, { isServer: true }),
    ).toThrow(/DATABASE_URL/);
  });

  it('treats empty optional values as unset', () => {
    const env = parseEnv({ ...validServerEnv, SENTRY_DSN: '' }, { isServer: true });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('validates only public variables on the client', () => {
    const env = parseEnv({ NEXT_PUBLIC_APP_URL: 'https://example.rs' }, { isServer: false });
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://example.rs');
  });
});
