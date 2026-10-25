import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from './button';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

/** Page-based navigation for tables (admin). */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  label,
}: {
  label?: string;
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  const t = useTranslations('ui.pagination');
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label ?? t('label')} className="flex items-center justify-between gap-3 pt-4">
      {page > 1 ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={hrefFor(page - 1)} rel="prev">
            <ChevronLeftIcon /> {t('previous')}
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="tabular text-sm text-ink-muted" aria-current="page">
        {t('status', { page, pageCount })}
      </span>
      {page < pageCount ? (
        <Button asChild variant="secondary" size="sm">
          <Link href={hrefFor(page + 1)} rel="next">
            {t('next')} <ChevronRightIcon />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
