import { notFound, redirect } from 'next/navigation';

import { routes } from '@/config/routes';

import { isAdmin } from '../policies';

import { requireUser, type CurrentUser } from './session';

/**
 * Admin area guard (SPEC §4.10): role=admin AND 2FA enabled. Non-admins get a 404 so the
 * admin area isn't advertised; admins without 2FA are sent to enable it.
 */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  const check = isAdmin(user);
  if (check.allowed) return user;
  if (!check.allowed && check.reason === 'admin_2fa_required')
    redirect(`${routes.settings}/bezbednost?admin=1`);
  notFound();
}
