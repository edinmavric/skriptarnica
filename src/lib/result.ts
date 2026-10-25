/**
 * Typed result for Server Actions and services (SPEC §2.2).
 * Actions return a Result instead of throwing raw errors to the client.
 */

export type AppErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface AppError {
  code: AppErrorCode;
  /** i18n message key, never user-facing text. */
  messageKey: string;
  /** Field-level i18n keys for form validation errors. */
  fieldErrors?: Record<string, string[]>;
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E = AppError>(error: E): Result<never, E> => ({ ok: false, error });

export const appError = (
  code: AppErrorCode,
  messageKey: string,
  fieldErrors?: Record<string, string[]>,
): AppError => (fieldErrors ? { code, messageKey, fieldErrors } : { code, messageKey });
