import { afterEach, describe, expect, it, vi } from 'vitest';

import { verifyTurnstile } from '@/server/turnstile';

vi.mock('@/server/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

function reply(body: object) {
  return Promise.resolve(new Response(JSON.stringify(body)));
}

describe('verifyTurnstile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retries once when Cloudflare cannot be reached', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockImplementationOnce(() => reply({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyTurnstile('token', '127.0.0.1')).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed after a second network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyTurnstile('token', '127.0.0.1')).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never retries an answer that the token is invalid', async () => {
    const fetchMock = vi.fn(() => reply({ success: false, 'error-codes': ['invalid-input'] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyTurnstile('token', '127.0.0.1')).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing token without calling Cloudflare', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifyTurnstile(undefined, '127.0.0.1')).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
