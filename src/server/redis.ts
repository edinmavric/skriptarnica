import { Redis } from '@upstash/redis';

import { env } from '@/env';

/** Upstash Redis over REST (locally: serverless-redis-http in docker-compose). */
export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
  enableTelemetry: false,
});
