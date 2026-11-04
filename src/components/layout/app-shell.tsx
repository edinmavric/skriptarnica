import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { GlobalSearch } from '@/components/features/search/global-search';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';

import { BottomNav } from './bottom-nav';
import { NotebookSheet } from './notebook-sheet';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import type { LayoutUser } from './types';

/**
 * Public/app chrome drawn as a notebook: the header is the front cover, every page a sheet on
 * the desk, the footer the back cover. Sticky header (desktop nav), mobile bottom nav.
 */
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
    <div className="desk flex min-h-dvh flex-col">
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
        className="mx-auto w-full max-w-6xl flex-1 px-2 pt-3 outline-none sm:px-6 sm:pt-6"
      >
        <NotebookSheet className="min-h-[60vh] px-4 pt-6 pb-10 sm:pr-8 md:pl-16">
          {children}
        </NotebookSheet>
      </main>
      <SiteFooter cookieSettings={cookieSettings} paymentNotice={paymentNotice} />
      <BottomNav />
    </div>
  );
}
