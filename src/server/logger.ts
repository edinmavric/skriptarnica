import pino from 'pino';

import { env } from '@/env';

/**
 * Structured logger (SPEC §11). Never log PII: no emails, names, IPs, tokens, file contents.
 * Log IDs instead (userId, orderId, requestId).
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: 'skripta', env: env.APP_ENV },
  redact: {
    paths: [
      'email',
      '*.email',
      'password',
      '*.password',
      'token',
      '*.token',
      'ip',
      '*.ip',
      'headers.cookie',
      'headers.authorization',
    ],
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { errName: error.name, errMessage: error.message, errStack: error.stack };
  }
  return { errValue: String(error) };
}
