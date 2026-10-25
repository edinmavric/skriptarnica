import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { DeletionBanner } from '@/components/layout/deletion-banner';
import { ImpersonationBanner } from '@/components/layout/impersonation-banner';
import { signOutAction } from '@/server/auth/actions';
import { getCurrentUser } from '@/server/auth/session';
import { getLayoutUser } from '@/server/services/layout';

export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const layoutUser = await getLayoutUser(user);
  return (
    <AppShell
      user={layoutUser}
      signOutAction={signOutAction}
      banner={
        <>
          {layoutUser?.impersonating ? <ImpersonationBanner name={layoutUser.name} /> : null}
          <DeletionBanner scheduledFor={layoutUser?.deletionScheduledFor ?? null} />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
