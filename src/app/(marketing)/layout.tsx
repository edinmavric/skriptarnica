import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { signOutAction } from '@/server/auth/actions';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell user={null} signOutAction={signOutAction}>
      {children}
    </AppShell>
  );
}
