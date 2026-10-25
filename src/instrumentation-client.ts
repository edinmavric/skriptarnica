import type * as SentryTypes from '@sentry/nextjs';

import { scrubEvent, sentryDataCollection } from '@/lib/sentry-scrub';

/**
 * Browser error reporting, loaded after the page is idle so the SDK never competes with the
 * first paint (SPEC §8.2 budget). Errors in the first moments before it loads are not
 * reported; server-side reporting is unaffected. Without a DSN nothing is downloaded.
 * The DSN is read directly (inlined at build, validated in src/env.ts on the server):
 * importing '@/env' here would ship zod to every page.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

type SentryModule = typeof SentryTypes;
let sentry: SentryModule | null = null;

if (dsn && typeof window !== 'undefined') {
  const load = () =>
    void import('@sentry/nextjs').then((module) => {
      module.init({
        dsn,
        dataCollection: sentryDataCollection,
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
        beforeSend: scrubEvent,
      });
      sentry = module;
    });
  if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 4000 });
  else setTimeout(load, 2000);
}

export function onRouterTransitionStart(
  ...args: Parameters<SentryModule['captureRouterTransitionStart']>
) {
  sentry?.captureRouterTransitionStart(...args);
}
