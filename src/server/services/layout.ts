import type { LayoutUser } from '@/components/layout/types';

import type { CurrentUser } from '../auth/session';

import { getLayoutCounters } from './layout-counters';

/** Data the header/menus need about the signed-in user. */
export async function getLayoutUser(user: CurrentUser | null): Promise<LayoutUser | null> {
  if (!user) return null;
  const counters = await getLayoutCounters(user.id);
  return {
    name: user.name,
    username: user.username,
    image: user.image,
    isAdmin: user.role === 'admin',
    isSeller: counters.isSeller,
    unreadNotifications: counters.unreadNotifications,
    deletionScheduledFor: counters.deletionScheduledFor,
    impersonating: Boolean(user.impersonatedBy),
  };
}
