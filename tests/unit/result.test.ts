import { describe, expect, it } from 'vitest';

import { appError, err, ok, type Result } from '@/lib/result';

describe('Result', () => {
  it('narrows on ok', () => {
    const result: Result<number> = ok(42);
    expect(result.ok && result.value).toBe(42);
  });

  it('carries a typed AppError', () => {
    const result: Result<number> = err(appError('NOT_FOUND', 'errors.notFound'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ code: 'NOT_FOUND', messageKey: 'errors.notFound' });
    }
  });

  it('includes field errors only when provided', () => {
    expect(appError('VALIDATION', 'errors.validation', { email: ['errors.email'] })).toHaveProperty(
      'fieldErrors.email',
    );
  });
});
