import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import { scrubEvent, scrubText } from '@/lib/sentry-scrub';

describe('sentry scrubbing', () => {
  it('masks emails and IPv4 addresses in text', () => {
    expect(scrubText('user pera@student.etf.bg.ac.rs from 192.168.1.10')).toBe(
      'user [email] from [ip]',
    );
  });

  it('keeps only the user id and drops sensitive headers', () => {
    const event = scrubEvent({
      type: undefined,
      user: { id: 'u1', email: 'a@b.rs', ip_address: '1.2.3.4' },
      request: { headers: { Cookie: 'x', 'User-Agent': 'ua' }, cookies: { s: '1' } },
    } as ErrorEvent);
    expect(event.user).toEqual({ id: 'u1' });
    expect(event.request?.headers).toEqual({ 'User-Agent': 'ua' });
    expect(event.request?.cookies).toBeUndefined();
  });
});
