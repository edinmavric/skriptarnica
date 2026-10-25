import { z } from 'zod';

/**
 * Environment variables, validated at import time.
 * The app refuses to start (dev, build, runtime) when the environment is invalid.
 * Every variable must also be documented in `.env.example`.
 */

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
const booleanString = (defaultValue: boolean) =>
  z.preprocess(
    (value) =>
      value === undefined || value === '' ? defaultValue : value === 'true' || value === '1',
    z.boolean(),
  );

/** "v1:<base64 32 bytes>,v2:<base64 32 bytes>" → versioned AES-256-GCM keys. */
const encryptionKeys = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.split(',').every((entry) => {
        const [version, key] = entry.split(':');
        return Boolean(
          version && /^v\d+$/.test(version) && key && Buffer.from(key, 'base64').length === 32,
        );
      }),
    'Must be "v1:<base64 32-byte key>[,v2:<key>...]". Generate with: openssl rand -base64 32',
  );

export const serverSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /**
     * Deployment stage, independent of NODE_ENV (which is "production" for every build).
     * Dev-only routes (/dev/*) and the mock payment provider are disabled when APP_ENV=production.
     */
    APP_ENV: z.enum(['development', 'test', 'preview', 'production']).default('development'),
    DATABASE_URL: z
      .url()
      .refine((value) => /^postgres(ql)?:\/\//.test(value), 'Must be a postgres:// connection URL'),

    // Auth (Better Auth)
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, 'Use at least 32 random characters (openssl rand -base64 32)'),
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    TURNSTILE_SECRET_KEY: z.string().min(1),
    /** Check passwords against Have I Been Pwned (k-anonymity). Only disable for offline test runs. */
    HIBP_ENABLED: booleanString(true),

    // Redis (Upstash REST)
    UPSTASH_REDIS_REST_URL: z.url(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1),
    /** Multiplies every rate limit. Only for E2E runs (many sign-ins from one IP); 1 in production. */
    RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(1000).default(1),

    // Object storage (Cloudflare R2, S3 API)
    S3_ENDPOINT: z.url(),
    S3_REGION: z.string().default('auto'),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_PRIVATE_BUCKET: z.string().min(1),
    S3_PUBLIC_BUCKET: z.string().min(1),
    S3_FORCE_PATH_STYLE: booleanString(false),

    // Background jobs (Inngest). Keys are required outside local development.
    INNGEST_EVENT_KEY: optionalString,
    INNGEST_SIGNING_KEY: optionalString,
    INNGEST_DEV: booleanString(false),

    // Email
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: z.string().min(3),
    /** Where operational alerts (dead jobs, webhook failures) are sent. */
    ALERT_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),

    // Payments
    PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
    MOCK_PAYMENT_WEBHOOK_SECRET: optionalString,

    // Security
    PAYOUT_ENCRYPTION_KEYS: encryptionKeys,
    PAYOUT_ENCRYPTION_ACTIVE_VERSION: z.string().regex(/^v\d+$/),
    /** Salt for hashing IP addresses before storage (SPEC §7.2). */
    IP_HASH_SALT: z.string().min(16),

    // Observability
    SENTRY_DSN: optionalUrl,
    SENTRY_AUTH_TOKEN: optionalString,
    SENTRY_ORG: optionalString,
    SENTRY_PROJECT: optionalString,
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  })
  .superRefine((value, ctx) => {
    const require = (key: keyof typeof value, message: string) => {
      if (!value[key]) ctx.addIssue({ code: 'custom', path: [key], message });
    };
    if (value.APP_ENV === 'production' || value.APP_ENV === 'preview') {
      require('RESEND_API_KEY', 'Required outside development: emails must actually be sent');
      require('INNGEST_EVENT_KEY', 'Required outside development');
      require('INNGEST_SIGNING_KEY', 'Required outside development');
    }
    if (
      (value.APP_ENV === 'production' || value.APP_ENV === 'preview') &&
      value.RATE_LIMIT_MULTIPLIER !== 1
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_MULTIPLIER'],
        message: 'Rate limits cannot be relaxed outside development and test',
      });
    }
    if (value.APP_ENV === 'production' && value.PAYMENT_PROVIDER === 'mock') {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'The mock payment provider cannot run in production',
      });
    }
    if (value.PAYMENT_PROVIDER === 'mock') {
      require('MOCK_PAYMENT_WEBHOOK_SECRET', 'Required by the mock payment provider');
    }
    if (Boolean(value.GOOGLE_CLIENT_ID) !== Boolean(value.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_CLIENT_SECRET'],
        message: 'Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
      });
    }
    const versions = value.PAYOUT_ENCRYPTION_KEYS.split(',').map((entry) => entry.split(':')[0]);
    if (!versions.includes(value.PAYOUT_ENCRYPTION_ACTIVE_VERSION)) {
      ctx.addIssue({
        code: 'custom',
        path: ['PAYOUT_ENCRYPTION_ACTIVE_VERSION'],
        message: 'Active version must exist in PAYOUT_ENCRYPTION_KEYS',
      });
    }
  });

export const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  /** Public base URL of the public bucket/CDN (preview images, avatars). */
  NEXT_PUBLIC_STORAGE_PUBLIC_URL: z.url(),
  /** Origin the browser uploads to with presigned PUT (the S3/R2 endpoint). */
  NEXT_PUBLIC_STORAGE_UPLOAD_ORIGIN: z.url(),
  NEXT_PUBLIC_POSTHOG_KEY: optionalString,
  NEXT_PUBLIC_POSTHOG_HOST: optionalUrl,
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;
export type Env = ServerEnv & ClientEnv;

type RawEnv = Record<string, string | undefined>;

export class InvalidEnvError extends Error {
  constructor(public readonly issues: readonly string[]) {
    super(`Invalid environment variables:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'InvalidEnvError';
  }
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}

/** Pure parser, exported for tests. On the client only public variables are validated. */
export function parseEnv(raw: RawEnv, options: { isServer: boolean }): Env {
  if (!options.isServer) {
    const result = clientSchema.safeParse(raw);
    if (!result.success) throw new InvalidEnvError(formatIssues(result.error));
    // On the client, server variables are never accessed; the cast keeps one typed object.
    return result.data as Env;
  }
  const server = serverSchema.safeParse(raw);
  const client = clientSchema.safeParse(raw);
  const issues = [
    ...(server.success ? [] : formatIssues(server.error)),
    ...(client.success ? [] : formatIssues(client.error)),
  ];
  if (issues.length > 0 || !server.success || !client.success) throw new InvalidEnvError(issues);
  return { ...server.data, ...client.data };
}

const isServer = typeof window === 'undefined';
const skipValidation = process.env.SKIP_ENV_VALIDATION === 'true';

// NEXT_PUBLIC_* values must be referenced statically so Next.js can inline them in the client bundle.
const runtimeEnv: RawEnv = {
  ...(isServer ? process.env : {}),
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_STORAGE_PUBLIC_URL: process.env.NEXT_PUBLIC_STORAGE_PUBLIC_URL,
  NEXT_PUBLIC_STORAGE_UPLOAD_ORIGIN: process.env.NEXT_PUBLIC_STORAGE_UPLOAD_ORIGIN,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
};

export const env: Env = skipValidation
  ? (runtimeEnv as unknown as Env)
  : parseEnv(runtimeEnv, { isServer });
