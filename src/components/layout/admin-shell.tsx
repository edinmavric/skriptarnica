import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { routes } from '@/config/routes';

import { ReauthProvider } from '@/components/features/admin/reauth';

import { AdminNavLink } from './admin-nav-link';
import { Wordmark } from './wordmark';

export const adminNav = [
  { href: '/admin', key: 'dashboard' },
  { href: '/admin/skripte', key: 'notes' },
  { href: '/admin/prijave', key: 'reports' },
  { href: '/admin/autorska-prava', key: 'copyright' },
  { href: '/admin/korisnici', key: 'users' },
  { href: '/admin/katalog', key: 'catalog' },
  { href: '/admin/katalog/zahtevi', key: 'catalogRequests' },
  { href: '/admin/porudzbine', key: 'orders' },
  { href: '/admin/povracaji', key: 'refunds' },
  { href: '/admin/isplate', key: 'payouts' },
  { href: '/admin/izvestaji', key: 'exports' },
  { href: '/admin/podesavanja', key: 'settings' },
  { href: '/admin/dnevnik', key: 'audit' },
] as const;

/** Admin chrome: same design system, denser layout, no marketing elements (SPEC §4.10). */
export async function AdminShell({
  children,
  nav = adminNav,
}: {
  children: ReactNode;
  nav?: readonly { href: string; key: string }[];
}) {
  const t = await getTranslations('admin.nav');
  return (
    <div className="min-h-dvh">
      <header className="border-b border-rule bg-paper-sunk">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Wordmark />
          <span className="text-sm font-semibold text-ink-muted">{t('title')}</span>
          <Link href={routes.home} className="ml-auto text-sm underline underline-offset-2">
            {t('backToSite')}
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 md:grid-cols-[13rem_1fr]">
        <nav aria-label={t('label')} className="-mx-4 min-w-0 px-4 md:mx-0 md:px-0">
          <ul className="flex gap-1 overflow-x-auto md:flex-col">
            {nav.map((item) => (
              <li key={item.href}>
                <AdminNavLink href={item.href}>{t(item.key as 'dashboard')}</AdminNavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main id="main" tabIndex={-1} className="min-w-0 outline-none">
          <ReauthProvider>{children}</ReauthProvider>
        </main>
      </div>
    </div>
  );
}
