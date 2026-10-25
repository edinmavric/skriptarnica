'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { routes } from '@/config/routes';
import { cn } from '@/lib/cn';

const sections = [
  { key: 'account', href: routes.settings },
  { key: 'privacy', href: `${routes.settings}/privatnost` },
  { key: 'notifications', href: `${routes.settings}/obavestenja` },
  { key: 'security', href: `${routes.settings}/bezbednost` },
  { key: 'data', href: `${routes.settings}/podaci` },
] as const;

/** Settings sections: a horizontal scroller on phones, a column on wide screens. */
export function SettingsNav() {
  const t = useTranslations('settings.nav');
  const pathname = usePathname();
  return (
    <nav aria-label={t('label')} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 border-b border-rule md:flex-col md:border-b-0 md:border-l">
        {sections.map((section) => {
          const current =
            section.href === routes.settings
              ? pathname === section.href
              : pathname.startsWith(section.href);
          return (
            <li key={section.key}>
              <Link
                href={section.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px flex min-h-11 items-center border-b-[2.5px] px-3 whitespace-nowrap md:mb-0 md:-ml-px md:border-b-0 md:border-l-[2.5px]',
                  current
                    ? 'border-ink font-medium text-ink'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )}
              >
                {t(section.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
