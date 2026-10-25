import { eq } from 'drizzle-orm';

import { db } from '../db/client';
import { sellerProfiles, users } from '../db/schema';
import { unreadCount } from './notifications';

/** Per-user values for the header and the deletion banner. */
export async function getLayoutCounters(userId: string): Promise<{
  isSeller: boolean;
  unreadNotifications: number;
  deletionScheduledFor: string | null;
}> {
  const [[seller], [user], unread] = await Promise.all([
    db
      .select({ status: sellerProfiles.status })
      .from(sellerProfiles)
      .where(eq(sellerProfiles.userId, userId)),
    db
      .select({ deletionScheduledFor: users.deletionScheduledFor })
      .from(users)
      .where(eq(users.id, userId)),
    unreadCount(userId),
  ]);
  return {
    isSeller: seller?.status === 'active' || seller?.status === 'suspended',
    unreadNotifications: unread,
    deletionScheduledFor: user?.deletionScheduledFor?.toISOString() ?? null,
  };
}
