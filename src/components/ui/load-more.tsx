'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, type ReactNode } from 'react';

import { Button } from './button';

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
