'use client';

import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type { ReactNode } from 'react';

import { CloseIcon } from './icons';

/** Mobile bottom sheet (SPEC §6.4). On wide screens it stays a centered bottom panel. */
export function Sheet({
  trigger,
  title,
  children,
  open,
  onOpenChange,
}: {
  trigger?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations('ui');
  return (
    <DialogPrimitive.Root
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
    >
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col rounded-t-lg border border-b-0 border-rule bg-paper-raised pb-[env(safe-area-inset-bottom)] shadow-lift data-[state=open]:animate-sheet-in"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-rule-strong" aria-hidden="true" />
          <div className="flex items-center justify-between gap-4 px-5 pt-2 pb-2">
            <DialogPrimitive.Title className="font-display text-lg font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="-mr-2 grid size-11 place-items-center rounded-md text-ink-muted hover:bg-paper-sunk"
              aria-label={t('close')}
            >
              <CloseIcon className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
