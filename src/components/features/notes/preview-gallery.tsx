'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState, type KeyboardEvent } from 'react';

import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, LockIcon } from '@/components/ui/icons';

interface Preview {
  pageNumber: number;
  url: string;
  width: number;
  height: number;
  blurred: boolean;
}

/** Preview pages: swipeable strip, click to zoom, arrow keys to page (SPEC §4.3). */
export function PreviewGallery({
  previews,
  title,
  totalPages,
}: {
  previews: Preview[];
  title: string;
  totalPages: number;
}) {
  const t = useTranslations('notes.page');
  const [open, setOpen] = useState<number | null>(null);
  const current = open !== null ? previews[open] : undefined;
  const move = (delta: number) =>
    setOpen((index) =>
      index === null ? null : Math.min(Math.max(index + delta, 0), previews.length - 1),
    );

  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') move(1);
    if (event.key === 'ArrowLeft') move(-1);
  }

  if (previews.length === 0) return null;
  return (
    <section aria-labelledby="preview-heading">
      <h2 id="preview-heading" className="sr-only">
        {t('previewHeading')}
      </h2>
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
        {previews.map((preview, index) => (
          <li
            key={preview.pageNumber}
            className="w-[72%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]"
          >
            <button
              type="button"
              onClick={() => setOpen(index)}
              className="paper-sheet relative block w-full overflow-hidden rounded-sm text-left"
            >
              {/* Accessible name = this verb + the image alt + any visible overlay text (WCAG 2.5.3). */}
              <span className="sr-only">{t('zoomVerb')} </span>
              <Image
                src={preview.url}
                alt={t('pageAlt', { page: preview.pageNumber, title })}
                width={preview.width}
                height={preview.height}
                sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 72vw"
                className="h-auto w-full"
                priority={index === 0}
              />
              {preview.blurred ? (
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-paper-raised/95 px-3 py-2 text-sm">
                  <LockIcon className="size-4 shrink-0" />{' '}
                  {t('morePages', { count: Math.max(totalPages - preview.pageNumber + 1, 1) })}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <DialogPrimitive.Root open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/80 data-[state=open]:animate-fade-in" />
          <DialogPrimitive.Content
            onKeyDown={onKey}
            aria-describedby={undefined}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-3 outline-none"
          >
            <DialogPrimitive.Title className="sr-only">
              {current ? t('pageAlt', { page: current.pageNumber, title }) : title}
            </DialogPrimitive.Title>
            {current ? (
              <Image
                src={current.url}
                alt={t('pageAlt', { page: current.pageNumber, title })}
                width={current.width}
                height={current.height}
                className="max-h-[85dvh] w-auto rounded-sm bg-white object-contain"
                sizes="95vw"
              />
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => move(-1)}
                disabled={open === 0}
                aria-label={t('previous')}
                className="grid size-11 place-items-center rounded-full bg-paper-raised text-ink disabled:opacity-40"
              >
                <ChevronLeftIcon className="size-5" />
              </button>
              <span className="tabular min-w-16 text-center text-paper">
                {current ? `${current.pageNumber} / ${previews.length}` : ''}
              </span>
              <button
                type="button"
                onClick={() => move(1)}
                disabled={open === previews.length - 1}
                aria-label={t('next')}
                className="grid size-11 place-items-center rounded-full bg-paper-raised text-ink disabled:opacity-40"
              >
                <ChevronRightIcon className="size-5" />
              </button>
              <DialogPrimitive.Close
                aria-label={t('closeGallery')}
                className="ml-2 grid size-11 place-items-center rounded-full bg-paper-raised text-ink"
              >
                <CloseIcon className="size-5" />
              </DialogPrimitive.Close>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  );
}
