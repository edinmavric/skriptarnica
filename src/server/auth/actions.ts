'use server';

import { redirect } from 'next/navigation';

/** Signs the current user out. Wired to Better Auth in Phase 2. */
export async function signOutAction(): Promise<void> {
  redirect('/');
}
