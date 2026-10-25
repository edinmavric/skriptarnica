import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { GlobalSearch } from '@/components/features/search/global-search';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';

import { BottomNav } from './bottom-nav';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import type { LayoutUser } from './types';

/** Public/app chrome: sticky header (desktop nav), mobile bottom nav, footer with legal links. */
export async function AppShell({
  user,
  children,
  search,
  cookieSettings,
  paymentNotice,
  signOutAction,
  banner,
}: {
  user: LayoutUser | null;
  children: ReactNode;
  search?: ReactNode;
  cookieSettings?: ReactNode;
  paymentNotice?: ReactNode;
  banner?: ReactNode;
  signOutAction: () => Promise<void>;
}) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <>
      {banner}
      <SiteHeader
        user={user}
        theme={theme}
        search={search ?? <GlobalSearch />}
        signOutAction={signOutAction}
      />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 pt-6 pb-8 outline-none sm:px-6"
      >
        {children}
      </main>
      <SiteFooter cookieSettings={cookieSettings} paymentNotice={paymentNotice} />
      <BottomNav />
    </>
  );
}
