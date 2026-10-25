'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { SearchIcon } from '@/components/ui/icons';

// The dialog (Radix + search box) is downloaded on first open, not with every page (SPEC §8.2).
const SearchDialog = dynamic(() => import('./search-dialog'), { ssr: false });

/** Header search trigger + Cmd/Ctrl+K dialog (desktop). */
export function GlobalSearch() {
  const t = useTranslations('search');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [mac] = useState(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
  );

  const trigger = useRef<HTMLButtonElement>(null);
  const show = (value: boolean) => {
    if (value) setLoaded(true);
    setOpen(value);
    // No Radix Trigger (the dialog is lazy), so focus returns to the button by hand.
    if (!value) requestAnimationFrame(() => trigger.current?.focus());
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setLoaded(true);
        setOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => show(true)}
        className="flex min-h-11 w-64 items-center gap-2 rounded-md border border-field bg-paper-raised px-3 text-left text-ink-muted hover:border-ink"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1 text-[0.95rem]">{t('trigger')}</span>
        <kbd suppressHydrationWarning className="rounded-xs border border-rule px-1.5 text-xs">
          {mac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
      {loaded ? <SearchDialog open={open} onOpenChange={show} /> : null}
    </>
  );
}
