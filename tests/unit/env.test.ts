import { describe, expect, it } from 'vitest';

import { InvalidEnvError, parseEnv } from '@/env';

const valid = {
  NODE_ENV: 'test',
  APP_ENV: 'test',
  DATABASE_URL: 'postgres://user:pass@localhost:5433/db',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  BETTER_AUTH_SECRET: 'x'.repeat(40),
  TURNSTILE_SECRET_KEY: 'secret',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
  UPSTASH_REDIS_REST_URL: 'http://localhost:8079',
  UPSTASH_REDIS_REST_TOKEN: 'token',
  S3_ENDPOINT: 'http://localhost:8333',
  S3_ACCESS_KEY_ID: 'a',
  S3_SECRET_ACCESS_KEY: 'b',
  S3_PRIVATE_BUCKET: 'private',
  S3_PUBLIC_BUCKET: 'public',
  NEXT_PUBLIC_STORAGE_PUBLIC_URL: 'http://localhost:8333/public',
  NEXT_PUBLIC_STORAGE_UPLOAD_ORIGIN: 'http://localhost:8333',
  EMAIL_FROM: 'Test <noreply@example.rs>',
  MOCK_PAYMENT_WEBHOOK_SECRET: 'mock-secret',
  PAYOUT_ENCRYPTION_KEYS: `v1:${Buffer.alloc(32, 1).toString('base64')}`,
  PAYOUT_ENCRYPTION_ACTIVE_VERSION: 'v1',
  IP_HASH_SALT: 's'.repeat(32),
};

describe('parseEnv', () => {
  it('accepts a complete local environment', () => {
    const env = parseEnv(valid, { isServer: true });
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(env.HIBP_ENABLED).toBe(true);
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('rejects a missing DATABASE_URL on the server', () => {
    const { DATABASE_URL: _omitted, ...rest } = valid;
    expect(() => parseEnv(rest, { isServer: true })).toThrow(InvalidEnvError);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() =>
      parseEnv({ ...valid, DATABASE_URL: 'mysql://localhost/db' }, { isServer: true }),
    ).toThrow(/DATABASE_URL/);
  });

  it('treats empty optional values as unset', () => {
    expect(parseEnv({ ...valid, SENTRY_DSN: '' }, { isServer: true }).SENTRY_DSN).toBeUndefined();
    expect(parseEnv({ ...valid, ALERT_EMAIL: '' }, { isServer: true }).ALERT_EMAIL).toBeUndefined();
  });

  it('validates only public variables on the client', () => {
    const env = parseEnv(
      {
        NEXT_PUBLIC_APP_URL: 'https://example.rs',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'k',
        NEXT_PUBLIC_STORAGE_PUBLIC_URL: 'https://cdn.example.rs',
        NEXT_PUBLIC_STORAGE_UPLOAD_ORIGIN: 'https://r2.example.rs',
      },
      { isServer: false },
    );
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://example.rs');
  });

  it('forbids the mock payment provider in production', () => {
    expect(() =>
      parseEnv(
        {
          ...valid,
          APP_ENV: 'production',
          RESEND_API_KEY: 'r',
          INNGEST_EVENT_KEY: 'e',
          INNGEST_SIGNING_KEY: 's',
        },
        { isServer: true },
      ),
    ).toThrow(/PAYMENT_PROVIDER/);
  });

  it('requires real email and job keys on preview/production', () => {
    expect(() => parseEnv({ ...valid, APP_ENV: 'preview' }, { isServer: true })).toThrow(
      /RESEND_API_KEY/,
    );
  });

  it('validates versioned encryption keys', () => {
    expect(() =>
      parseEnv({ ...valid, PAYOUT_ENCRYPTION_KEYS: 'v1:short' }, { isServer: true }),
    ).toThrow(/PAYOUT_ENCRYPTION_KEYS/);
    expect(() =>
      parseEnv({ ...valid, PAYOUT_ENCRYPTION_ACTIVE_VERSION: 'v2' }, { isServer: true }),
    ).toThrow(/ACTIVE_VERSION/);
  });

  it('requires both Google OAuth values or neither', () => {
    expect(() => parseEnv({ ...valid, GOOGLE_CLIENT_ID: 'id' }, { isServer: true })).toThrow(
      /GOOGLE/,
    );
  });
});
