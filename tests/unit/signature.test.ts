import { describe, expect, it } from 'vitest';

import { signPayload, verifySignature } from '@/server/payments/signature';

describe('webhook signatures', () => {
  const secret = 'test-secret';
  const body = JSON.stringify({ id: 'evt_1', type: 'payment.succeeded' });

  it('accepts a fresh, correct signature', () => {
    expect(verifySignature(secret, body, signPayload(secret, body))).toBe(true);
  });

  it('rejects a tampered body, a wrong secret, a missing header and garbage', () => {
    const header = signPayload(secret, body);
    expect(verifySignature(secret, `${body} `, header)).toBe(false);
    expect(verifySignature('other', body, header)).toBe(false);
    expect(verifySignature(secret, body, null)).toBe(false);
    expect(verifySignature(secret, body, 't=abc,v1=zz')).toBe(false);
  });

  it('rejects replays outside the tolerance window', () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(verifySignature(secret, body, signPayload(secret, body, old))).toBe(false);
  });
});
