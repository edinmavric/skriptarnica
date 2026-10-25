import { notFound } from 'next/navigation';

import { env } from '@/env';

/** Dev-only surfaces (/dev/ui, /dev/mock-checkout, /dev/outbox) never exist in production. */
export function devRoutesEnabled(): boolean {
  return env.APP_ENV !== 'production';
}

export function assertDevRoutes(): void {
  if (!devRoutesEnabled()) notFound();
}
