'use client';

import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState } from 'react';

import { SearchIcon } from '@/components/ui/icons';

import { SearchBox } from './search-box';

/** Header search trigger + Cmd/Ctrl+K dialog (desktop). */
export function GlobalSearch() {
  const t = useTranslations('search');
  const [open, setOpen] = useState(false);
  const [mac] = useState(
    () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform),
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger className="flex min-h-11 w-64 items-center gap-2 rounded-md border border-field bg-paper-raised px-3 text-left text-ink-muted hover:border-ink">
        <SearchIcon className="size-4" />
        <span className="flex-1 text-[0.95rem]">{t('trigger')}</span>
        <kbd suppressHydrationWarning className="rounded-xs border border-rule px-1.5 text-xs">
          {mac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 rounded-lg border border-rule bg-paper-raised p-3 shadow-lift data-[state=open]:animate-pop-in"
        >
          <DialogPrimitive.Title className="sr-only">{t('label')}</DialogPrimitive.Title>
          <SearchBox autoFocus onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
