import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { sellerProfiles } from '../db/schema';
import { unreadCount } from './notifications';

/** Per-user values for the header. */
export async function getLayoutCounters(userId: string): Promise<{
  isSeller: boolean;
  unreadNotifications: number;
}> {
  const [[seller], unread] = await Promise.all([
    db
      .select({ status: sellerProfiles.status })
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, userId)),
    unreadCount(userId),
  ]);
  return {
    isSeller: seller?.status === 'active' || seller?.status === 'suspended',
    unreadNotifications: unread,
  };
}
