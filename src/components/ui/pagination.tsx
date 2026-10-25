'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';

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

/**
 * Cursor pagination for feeds: a real "Load more" button (keyboard/AT friendly) that also
 * triggers automatically when scrolled into view.
 */
export function LoadMore({
  onLoadMore,
  loading,
  hasMore,
  auto = true,
  children,
}: {
  onLoadMore: () => void;
  loading: boolean;
  hasMore: boolean;
  auto?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations('ui.pagination');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!auto || !hasMore || loading || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: '400px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [auto, hasMore, loading, onLoadMore]);
  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-4">
      <Button variant="secondary" loading={loading} onClick={onLoadMore}>
        {children ?? t('loadMore')}
      </Button>
    </div>
  );
}
