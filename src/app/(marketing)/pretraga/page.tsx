import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Highlighted, SearchBox } from '@/components/features/search/search-box';
import { EmptyState } from '@/components/ui/empty-state';
import { routes } from '@/config/routes';
import { cn } from '@/lib/cn';
import { getCurrentUser } from '@/server/auth/session';
import { search, SEARCH_GROUP_ORDER, type SearchResultType } from '@/server/services/search';

type Props = { searchParams: Promise<{ q?: string; f?: string; tip?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const t = await getTranslations('search');
  return {
    title: q ? t('titleFor', { query: q }) : t('title'),
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = '', f, tip } = await searchParams;
  const t = await getTranslations('search');
  const type = SEARCH_GROUP_ORDER.includes(tip as SearchResultType)
    ? (tip as SearchResultType)
    : null;
  const user = await getCurrentUser();
  const results =
    q.trim().length >= 2
      ? await search(q.slice(0, 120), {
          limitPerType: type ? 30 : 8,
          viewerId: user?.id ?? null,
          facultySlug: f ?? null,
          ...(type ? { types: [type] } : {}),
        })
      : null;
  const hrefFor = (nextType: SearchResultType | null) => {
    const params = new URLSearchParams({ q });
    if (f) params.set('f', f);
    if (nextType) params.set('tip', nextType);
    return `${routes.search}?${params}`;
  };
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{q ? t('titleFor', { query: q }) : t('title')}</h1>
      <div className="max-w-xl">
        <SearchBox autoFocus={!q} size="lg" facultySlug={f ?? null} />
      </div>
      {results ? (
        <>
          <nav aria-label={t('filterTypes')} className="flex flex-wrap gap-2">
            {[null, ...SEARCH_GROUP_ORDER].map((option) => (
              <Link
                key={option ?? 'all'}
                href={hrefFor(option)}
                aria-current={option === type ? 'page' : undefined}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm',
                  option === type
                    ? 'border-ink bg-ink text-paper'
                    : 'border-field hover:border-ink',
                )}
              >
                {option ? t(`types.${option}`) : t('all')}
              </Link>
            ))}
          </nav>
          {results.groups.length === 0 ? (
            <EmptyState title={t('noResultsTitle')} description={t('noResultsDescription')} />
          ) : (
            results.groups.map((group) => (
              <section key={group.type} aria-labelledby={`group-${group.type}`}>
                <h2 id={`group-${group.type}`} className="mb-2 text-display-sm font-semibold">
                  {t(`types.${group.type}`)}
                </h2>
                <ul className="divide-y divide-rule border-y border-rule">
                  {group.results.map((result) => (
                    <li key={result.id}>
                      <Link
                        href={result.href}
                        className="flex min-h-12 flex-col justify-center py-2 hover:bg-paper-sunk"
                      >
                        <span className="font-medium">
                          <Highlighted text={result.title} query={q} />
                        </span>
                        {result.subtitle ? (
                          <span className="text-sm text-ink-muted">{result.subtitle}</span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      ) : (
        <p className="text-ink-muted">{t('hint')}</p>
      )}
    </div>
  );
}
