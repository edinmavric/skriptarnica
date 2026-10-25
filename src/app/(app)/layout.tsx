import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { DeletionBanner } from '@/components/layout/deletion-banner';
import { signOutAction } from '@/server/auth/actions';
import { requireAppUser } from '@/server/auth/session';
import { getLayoutUser } from '@/server/services/layout';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireAppUser();
  const layoutUser = await getLayoutUser(user);
  return (
    <AppShell
      user={layoutUser}
      signOutAction={signOutAction}
      banner={<DeletionBanner scheduledFor={layoutUser?.deletionScheduledFor ?? null} />}
    >
      {children}
    </AppShell>
  );
}
