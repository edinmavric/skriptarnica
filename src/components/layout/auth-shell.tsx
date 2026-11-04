import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { parseTheme, THEME_COOKIE } from '@/lib/theme';

import { NotebookSheet } from './notebook-sheet';
import { SiteFooter } from './site-footer';
import { ThemeToggle } from './theme-toggle';
import { Wordmark } from './wordmark';

/** Minimal chrome for sign-in/sign-up: a torn-out sheet on the cover, no nav to distract. */
export async function AuthShell({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <div className="desk flex min-h-dvh flex-col">
      <header className="on-cover">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <ThemeToggle initial={theme} />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-md flex-1 px-3 pt-6 pb-12 outline-none sm:pt-10"
      >
        {/* A sheet torn out of the notebook, lying on the cover. */}
        <NotebookSheet
          paper="plain"
          registers={false}
          className="torn-top rounded-t-none px-5 pt-9 pb-8 md:pl-16"
        >
          {children}
        </NotebookSheet>
      </main>
      <SiteFooter />
    </div>
  );
}
