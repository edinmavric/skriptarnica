'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { SearchIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/spinner';
import { routes } from '@/config/routes';
import { cn } from '@/lib/cn';
import { highlightSegments } from '@/lib/search/highlight';

interface Result {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}
interface Group {
  type: string;
  results: Result[];
}

export function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightSegments(text, query).map((segment, index) =>
        segment.match ? (
          <mark key={index}>{segment.text}</mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Global search combobox (SPEC §4.6): 200 ms debounce, grouped ARIA listbox, keyboard
 * navigation; Enter without a selection opens the full results page.
 */
export function SearchBox({
  autoFocus,
  facultySlug,
  onNavigate,
  size = 'md',
  label,
}: {
  autoFocus?: boolean;
  facultySlug?: string | null;
  onNavigate?: () => void;
  size?: 'md' | 'lg';
  label?: string;
}) {
  const t = useTranslations('search');
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  const trimmedQuery = query.trim();
  const visibleGroups = useMemo(
    () => (trimmedQuery.length >= 2 ? groups : []),
    [groups, trimmedQuery],
  );
  const indexed = useMemo(() => {
    const offsets = visibleGroups.map((_, i) =>
      visibleGroups.slice(0, i).reduce((sum, g) => sum + g.results.length, 0),
    );
    return visibleGroups.map((group, groupIndex) => ({
      ...group,
      results: group.results.map((result, i) => ({
        ...result,
        index: (offsets[groupIndex] ?? 0) + i,
      })),
    }));
  }, [visibleGroups]);
  const flat = useMemo(() => indexed.flatMap((group) => group.results), [indexed]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestRef.current?.abort();
      return;
    }
    const timer = setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: trimmed });
        if (facultySlug) params.set('f', facultySlug);
        const response = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { groups: Group[] };
        setGroups(data.groups);
        setActive(-1);
        const count = data.groups.reduce((sum, group) => sum + group.results.length, 0);
        setStatus(count === 0 ? t('noResults') : t('resultsCount', { count }));
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setGroups([]);
          setStatus(t('error'));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query, facultySlug, t]);

  function go(href: string) {
    setOpen(false);
    onNavigate?.();
    router.push(href);
  }

  function submitFull() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const params = new URLSearchParams({ q: trimmed });
    if (facultySlug) params.set('f', facultySlug);
    go(`${routes.search}?${params}`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const target = flat[active];
      if (target) go(target.href);
      else submitFull();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && trimmedQuery.length >= 2 && (visibleGroups.length > 0 || !loading);

  return (
    <div className="relative w-full">
      <div className="relative">
        <SearchIcon
          className={cn(
            'pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted',
            size === 'lg' ? 'size-5' : 'size-4',
          )}
        />
        <input
          type="search"
          role="combobox"
          aria-label={label ?? t('label')}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={query}
          placeholder={t('placeholder')}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          className={cn(
            'w-full rounded-md border border-field bg-paper-raised pr-10 text-ink placeholder:text-ink-faint hover:border-ink focus-visible:border-pen',
            size === 'lg' ? 'min-h-14 pl-11 text-lg' : 'min-h-11 pl-9',
          )}
        />
        {loading ? (
          <Spinner className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted" />
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      <div
        className={cn(
          'absolute z-50 mt-1 max-h-[70vh] w-full overflow-y-auto rounded-md border border-rule bg-paper-raised p-1 shadow-lift',
          !showList && 'hidden',
        )}
      >
        <ul id={listId} role="listbox" aria-label={t('results')}>
          {indexed.map((group) => (
            <li key={group.type} role="presentation">
              <ul role="group" aria-labelledby={`${listId}-g-${group.type}`}>
                <li
                  role="presentation"
                  id={`${listId}-g-${group.type}`}
                  className="px-3 pt-2 pb-1 text-sm font-semibold text-ink-muted"
                >
                  {t(
                    `types.${group.type as 'note' | 'course' | 'professor' | 'community' | 'post' | 'faculty' | 'university'}`,
                  )}
                </li>
                {group.results.map((result) => {
                  const current = result.index;
                  return (
                    <li
                      key={`${result.type}-${result.id}`}
                      id={`${listId}-${current}`}
                      role="option"
                      aria-selected={current === active}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActive(current)}
                      onClick={() => go(result.href)}
                      className={cn(
                        'flex min-h-11 cursor-pointer flex-col justify-center rounded-sm px-3 py-1.5',
                        current === active && 'bg-paper-sunk',
                      )}
                    >
                      <span className="truncate">
                        <Highlighted text={result.title} query={query} />
                      </span>
                      {result.subtitle ? (
                        <span className="truncate text-sm text-ink-muted">{result.subtitle}</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
        {groups.length === 0 && !loading ? (
          <p className="px-3 py-3 text-sm text-ink-muted">{t('noResults')}</p>
        ) : null}
        {query.trim().length >= 2 ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={submitFull}
            className="mt-1 w-full rounded-sm px-3 py-2.5 text-left text-sm text-pen hover:bg-paper-sunk"
          >
            {t('allResults', { query: query.trim() })}
          </button>
        ) : null}
      </div>
    </div>
  );
}
