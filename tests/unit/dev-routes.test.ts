import { describe, expect, it, vi } from 'vitest';

/** SPEC Phase 11: /dev/* and dev APIs must not exist when APP_ENV=production. */
async function withAppEnv(appEnv: 'production' | 'preview' | 'development') {
  vi.resetModules();
  vi.doMock('@/env', () => ({ env: { APP_ENV: appEnv } }));
  return import('@/lib/dev');
}

describe('dev routes', () => {
  it('are disabled in production and enabled in development', async () => {
    expect((await withAppEnv('production')).devRoutesEnabled()).toBe(false);
    expect((await withAppEnv('development')).devRoutesEnabled()).toBe(true);
  });

  it('assertDevRoutes 404s in production', async () => {
    vi.doMock('next/navigation', () => ({
      notFound: () => {
        throw new Error('NEXT_NOT_FOUND');
      },
    }));
    const { assertDevRoutes } = await withAppEnv('production');
    expect(() => assertDevRoutes()).toThrow('NEXT_NOT_FOUND');
  });

  it('dev API handlers answer 404 in production', async () => {
    vi.resetModules();
    vi.doMock('@/env', () => ({ env: { APP_ENV: 'production' } }));
    vi.doMock('@/server/email/transport', () => ({ readDevOutbox: vi.fn(async () => []) }));
    vi.doMock('@/server/db/client', () => ({ db: {} }));
    vi.doMock('@/server/services/account-deletion', () => ({ executeDueDeletions: vi.fn() }));
    const { NextRequest } = await import('next/server');
    const outbox = await import('@/app/api/dev/outbox/route');
    const analytics = await import('@/app/api/dev/analytics/[...path]/route');
    const deletion = await import('@/app/api/dev/account-deletion/route');
    expect((await outbox.GET(new NextRequest('http://x/api/dev/outbox'))).status).toBe(404);
    expect(analytics.POST().status).toBe(404);
    expect(
      (await deletion.POST(new NextRequest('http://x/api/dev/account-deletion?email=a@b.rs')))
        .status,
    ).toBe(404);
  });
});
