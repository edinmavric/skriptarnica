import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { sellerProfiles } from '../db/schema';

/** Per-user counters for the header. Notifications are added with the notifications phase. */
export async function getLayoutCounters(
  userId: string,
): Promise<{ isSeller: boolean; unreadNotifications: number }> {
  const [seller] = await db
    .select({ status: sellerProfiles.status })
    .from(sellerProfiles)
    .where(eq(sellerProfiles.userId, userId));
  return {
    isSeller: seller?.status === 'active' || seller?.status === 'suspended',
    unreadNotifications: 0,
  };
}
