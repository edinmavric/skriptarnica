import * as Sentry from '@sentry/nextjs';

import { env } from '@/env';
import { scrubEvent, sentryDataCollection } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: env.SENTRY_DSN,
  enabled: Boolean(env.SENTRY_DSN),
  environment: env.NODE_ENV,
  dataCollection: sentryDataCollection,
  tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1,
  beforeSend: scrubEvent,
});
