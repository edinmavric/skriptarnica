import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { cn } from '@/lib/cn';
import type { TopWindow } from '@/lib/ranking';

/** Sort switcher as links (works without JS; each sort has its own URL). */
export async function SortTabs({
  base,
  current,
  window,
  sorts,
  namespace,
}: {
  base: string;
  current: string;
  window?: TopWindow | undefined;
  sorts: readonly string[];
  namespace: 'posts' | 'comments';
}) {
  const t = await getTranslations(`forum.sort.${namespace}`);
  const tWindow = await getTranslations('forum.sort.window');
  return (
    <div className="flex flex-col gap-2">
      <nav aria-label={t('label')} className="flex flex-wrap gap-1 border-b border-rule">
        {sorts.map((sort) => (
          <Link
            key={sort}
            href={`${base}?sort=${sort}`}
            aria-current={sort === current ? 'page' : undefined}
            className={cn(
              '-mb-px min-h-11 content-center border-b-[2.5px] px-3 text-[0.95rem]',
              sort === current
                ? 'border-ink font-medium text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t(sort as 'hot')}
          </Link>
        ))}
      </nav>
      {namespace === 'posts' && current === 'top' ? (
        <nav aria-label={tWindow('label')} className="flex flex-wrap gap-2">
          {(['dan', 'nedelja', 'mesec', 'godina', 'sve'] as const).map((w) => (
            <Link
              key={w}
              href={`${base}?sort=top&period=${w}`}
              aria-current={w === (window ?? 'nedelja') ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-sm',
                w === (window ?? 'nedelja')
                  ? 'border-ink bg-ink text-paper'
                  : 'border-field hover:border-ink',
              )}
            >
              {tWindow(w)}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
