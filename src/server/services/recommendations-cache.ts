import { logger } from '../logger';
import { redis } from '../redis';

/** Recommendation cache key per user (SPEC §4.5: Redis, 15 min, invalidated on course changes). */
export const recommendationsKey = (userId: string) => `reco:v1:${userId}`;

export async function invalidateRecommendations(userId: string): Promise<void> {
  try {
    await redis.del(recommendationsKey(userId));
  } catch (error) {
    logger.warn(
      { userId, err: error instanceof Error ? error.message : String(error) },
      'recommendation cache invalidation failed',
    );
  }
}
