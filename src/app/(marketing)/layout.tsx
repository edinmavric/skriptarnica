import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { signOutAction } from '@/server/auth/actions';
import { getCurrentUser } from '@/server/auth/session';
import { getLayoutUser } from '@/server/services/layout';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return (
    <AppShell user={await getLayoutUser(user)} signOutAction={signOutAction}>
      {children}
    </AppShell>
  );
}
