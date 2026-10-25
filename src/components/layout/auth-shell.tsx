import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import { parseTheme, THEME_COOKIE } from '@/lib/theme';

import { SiteFooter } from './site-footer';
import { ThemeToggle } from './theme-toggle';
import { Wordmark } from './wordmark';

/** Minimal chrome for sign-in/sign-up: no nav to distract from the form. */
export async function AuthShell({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <>
      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <ThemeToggle initial={theme} />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-md px-4 pt-8 pb-12 outline-none sm:pt-12"
      >
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
