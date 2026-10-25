import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { BellIcon } from '@/components/ui/icons';
import { routes } from '@/config/routes';
import type { Theme } from '@/lib/theme';

import { ThemeToggle } from './theme-toggle';
import type { LayoutUser } from './types';
import { UserMenu } from './user-menu';
import { Wordmark } from './wordmark';

export async function SiteHeader({
  user,
  theme,
  search,
  signOutAction,
}: {
  user: LayoutUser | null;
  theme: Theme;
  /** Global search trigger (client), rendered by the layout. */
  search?: ReactNode;
  signOutAction: () => Promise<void>;
}) {
  const t = await getTranslations('layout');
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/95 backdrop-blur-[2px] supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Wordmark />
        <nav aria-label={t('mainNav')} className="ml-4 hidden items-center gap-1 md:flex">
          <Link
            href={routes.communities}
            className="rounded-md px-3 py-2 text-[0.95rem] hover:bg-paper-sunk"
          >
            {t('nav.communities')}
          </Link>
          {user ? (
            <Link
              href={routes.library}
              className="rounded-md px-3 py-2 text-[0.95rem] hover:bg-paper-sunk"
            >
              {t('nav.library')}
            </Link>
          ) : null}
          <Link
            href={user?.isSeller ? routes.sell : routes.becomeSeller}
            className="rounded-md px-3 py-2 text-[0.95rem] hover:bg-paper-sunk"
          >
            {user?.isSeller ? t('nav.sell') : t('nav.startSelling')}
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {search ? <div className="hidden md:block">{search}</div> : null}
          <ThemeToggle initial={theme} />
          {user ? (
            <>
              <Link
                href={routes.notifications}
                className="relative grid size-11 place-items-center rounded-md text-ink-muted hover:bg-paper-sunk hover:text-ink"
                aria-label={t('notifications', { count: user.unreadNotifications })}
              >
                <BellIcon className="size-5" />
                {user.unreadNotifications > 0 ? (
                  <span className="tabular absolute top-1.5 right-1.5 min-w-4.5 rounded-full bg-marker px-1 text-center text-[0.7rem] leading-4.5 font-bold text-marker-ink">
                    {user.unreadNotifications > 99 ? '99+' : user.unreadNotifications}
                  </span>
                ) : null}
              </Link>
              <div className="hidden md:block">
                <UserMenu user={user} signOutAction={signOutAction} />
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link href={routes.signIn}>{t('signIn')}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href={routes.signUp}>{t('signUp')}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
