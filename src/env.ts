import { z } from 'zod';

/**
 * Environment variables, validated at import time.
 * The app refuses to start (dev, build, runtime) when the environment is invalid.
 * Every variable must also be documented in `.env.example`.
 */

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());

export const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .url()
    .refine((value) => /^postgres(ql)?:\/\//.test(value), 'Must be a postgres:// connection URL'),
  SENTRY_DSN: optionalUrl,
  SENTRY_AUTH_TOKEN: optionalString,
  SENTRY_ORG: optionalString,
  SENTRY_PROJECT: optionalString,
});

export const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;
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
  const schema = options.isServer ? serverSchema.extend(clientSchema.shape) : clientSchema;
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new InvalidEnvError(formatIssues(result.error));
  }
  // On the client, server variables are never accessed; the cast keeps one typed object.
  return result.data as Env;
}

const isServer = typeof window === 'undefined';
const skipValidation = process.env.SKIP_ENV_VALIDATION === 'true';

// NEXT_PUBLIC_* values must be referenced statically so Next.js can inline them in the client bundle.
const runtimeEnv: RawEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  SENTRY_DSN: process.env.SENTRY_DSN,
  SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
  SENTRY_ORG: process.env.SENTRY_ORG,
  SENTRY_PROJECT: process.env.SENTRY_PROJECT,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
};

export const env: Env = skipValidation
  ? (runtimeEnv as unknown as Env)
  : parseEnv(runtimeEnv, { isServer });
