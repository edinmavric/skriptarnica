import * as Sentry from '@sentry/nextjs';

import { env } from '@/env';
import { scrubEvent, sentryDataCollection } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(env.NEXT_PUBLIC_SENTRY_DSN),
  dataCollection: sentryDataCollection,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
  beforeSend: scrubEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
