import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { JsonLd } from '@/components/seo/json-ld';
import { ChevronRightIcon } from '@/components/ui/icons';
import { env } from '@/env';

export interface Crumb {
  label: string;
  href: string;
}

/** Visible breadcrumb trail + BreadcrumbList JSON-LD. The last crumb is the current page. */
export async function Breadcrumbs({ items }: { items: Crumb[] }) {
  const t = await getTranslations('layout');
  return (
    <>
      <nav aria-label={t('breadcrumbs')} className="mb-4 text-sm text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          {items.map((item, index) => (
            <li key={item.href} className="flex items-center gap-1">
              {index > 0 ? <ChevronRightIcon className="size-3.5" /> : null}
              {index === items.length - 1 ? (
                <span aria-current="page" className="text-ink">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="underline-offset-2 hover:underline">
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: items.map((item, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: item.label,
            item: `${env.NEXT_PUBLIC_APP_URL}${item.href}`,
          })),
        }}
      />
    </>
  );
}
