'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { CommunityIcon, HomeIcon, LibraryIcon, SearchIcon, UserIcon } from '@/components/ui/icons';
import { routes } from '@/config/routes';
import { cn } from '@/lib/cn';

const items = [
  { href: routes.home, key: 'home', Icon: HomeIcon, match: (p: string) => p === '/' },
  {
    href: routes.search,
    key: 'search',
    Icon: SearchIcon,
    match: (p: string) => p.startsWith('/pretraga'),
  },
  {
    href: routes.communities,
    key: 'communities',
    Icon: CommunityIcon,
    match: (p: string) => p.startsWith('/z'),
  },
  {
    href: routes.library,
    key: 'library',
    Icon: LibraryIcon,
    match: (p: string) => p.startsWith('/biblioteka'),
  },
  {
    href: routes.profileRedirect,
    key: 'profile',
    Icon: UserIcon,
    match: (p: string) =>
      p.startsWith('/u/') || p.startsWith('/podesavanja') || p.startsWith('/profil'),
  },
] as const;

/** Mobile bottom navigation (SPEC §6.4): Home, Search, Communities, Library, Profile. */
export function BottomNav() {
  const t = useTranslations('layout.bottomNav');
  const pathname = usePathname();
  return (
    <nav
      aria-label={t('label')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {items.map(({ href, key, Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.72rem]',
                  active ? 'font-semibold text-ink' : 'text-ink-muted',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-12 place-items-center rounded-full',
                    active && 'bg-marker text-marker-ink',
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.2 : 1.75} />
                </span>
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
