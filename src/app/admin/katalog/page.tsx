import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { catalogEntityTypes, type CatalogEntityType } from '@/lib/validation/admin';
import { listCatalog } from '@/server/services/admin/catalog-admin';

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string; q?: string; strana?: string }>;
}) {
  const t = await getTranslations('admin.catalog');
  const query = await searchParams;
  const type: CatalogEntityType = catalogEntityTypes.includes(query.tip as CatalogEntityType)
    ? (query.tip as CatalogEntityType)
    : 'course';
  const q = query.q ?? '';
  const page = Math.max(0, Number(query.strana ?? 0) || 0);
  const { rows, hasMore } = await listCatalog(type, q, page);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-display font-bold">{t('title')}</h1>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link href="/admin/katalog/uvoz">{t('import')}</Link>
          </Button>
          <Button asChild>
            <Link href={`/admin/katalog/${type}/novi`}>{t(`new.${type}`)}</Link>
          </Button>
        </div>
      </div>
      <nav aria-label={t('types')} className="flex flex-wrap gap-1 border-b border-rule">
        {catalogEntityTypes.map((entity) => (
          <Link
            key={entity}
            href={`/admin/katalog?tip=${entity}`}
            aria-current={entity === type ? 'page' : undefined}
            className={cn(
              '-mb-px min-h-11 content-center border-b-[2.5px] px-3 text-sm',
              entity === type
                ? 'border-ink font-medium'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t(`plural.${entity}`)}
          </Link>
        ))}
      </nav>
      <form role="search" className="flex max-w-xl gap-2">
        <input type="hidden" name="tip" value={type} />
        <label htmlFor="catalog-search" className="sr-only">
          {t('search')}
        </label>
        <Input id="catalog-search" name="q" defaultValue={q} placeholder={t('searchPlaceholder')} />
        <Button type="submit" variant="secondary">
          {t('search')}
        </Button>
      </form>
      {rows.length === 0 ? (
        <p className="text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <Link
                href={`/admin/katalog/${type}/${row.id}`}
                className="font-medium text-pen underline underline-offset-2"
              >
                {row.name}
              </Link>
              <span className="text-sm text-ink-muted">
                {row.parent ? `${row.parent}, ` : ''}
                {row.slug}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-3">
        {page > 0 ? (
          <Link
            href={`?tip=${type}&q=${encodeURIComponent(q)}&strana=${page - 1}`}
            className="text-pen underline underline-offset-2"
          >
            {t('prev')}
          </Link>
        ) : null}
        {hasMore ? (
          <Link
            href={`?tip=${type}&q=${encodeURIComponent(q)}&strana=${page + 1}`}
            className="text-pen underline underline-offset-2"
          >
            {t('next')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
