import { redirect } from 'next/navigation';

import { routes } from '@/config/routes';
import { requireAppUser } from '@/server/auth/session';

/** /profil → the signed-in user's public profile (or settings, if no username yet). */
export default async function OwnProfileRedirect() {
  const user = await requireAppUser();
  redirect(user.username ? routes.user(user.username) : routes.settings);
}
