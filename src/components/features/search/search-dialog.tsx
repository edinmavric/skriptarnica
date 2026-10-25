'use client';

import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from 'radix-ui';

import { SearchBox } from './search-box';

/** The Cmd/Ctrl+K dialog itself; loaded on first open (see GlobalSearch). */
export default function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('search');
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 rounded-lg border border-rule bg-paper-raised p-3 shadow-lift data-[state=open]:animate-pop-in"
        >
          <DialogPrimitive.Title className="sr-only">{t('label')}</DialogPrimitive.Title>
          <SearchBox autoFocus onNavigate={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
