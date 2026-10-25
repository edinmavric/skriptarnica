'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { cn } from '@/lib/cn';

import { StarIcon } from './icons';

const ratingFormat = new Intl.NumberFormat('sr-Latn-RS', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

/** Read-only rating; announced as text ("Ocena 4,5 od 5"). */
export function RatingStars({
  value,
  count,
  size = 'sm',
  compact = false,
  className,
}: {
  value: number | null;
  count?: number;
  /** Show the count as "(23)" with the full text for screen readers. */
  compact?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useTranslations('ui.rating');
  if (value === null) {
    return (
      <span className={cn('text-sm whitespace-nowrap text-ink-muted', className)}>{t('none')}</span>
    );
  }
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span
        role="img"
        aria-label={t('label', { value: ratingFormat.format(value) })}
        className="inline-flex text-warning"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className="relative inline-block">
            <StarIcon className={cn(size === 'sm' ? 'size-3.5' : 'size-5', 'text-rule-strong')} />
            {rounded >= star - 0.5 ? (
              <span
                className="absolute inset-0 overflow-hidden"
                style={{ width: rounded >= star ? '100%' : '50%' }}
              >
                <StarIcon filled className={cn(size === 'sm' ? 'size-3.5' : 'size-5')} />
              </span>
            ) : null}
          </span>
        ))}
      </span>
      <span className="tabular text-sm font-medium">{ratingFormat.format(value)}</span>
      {count !== undefined ? (
        compact ? (
          <span className="tabular text-sm text-ink-muted">
            <span aria-hidden="true">({count})</span>
            <span className="sr-only">{t('count', { count })}</span>
          </span>
        ) : (
          <span className="text-sm text-ink-muted">({t('count', { count })})</span>
        )
      ) : null}
    </span>
  );
}

/** Rating input built from native radios: arrow keys work, label per star. */
export function RatingInput({
  value,
  onChange,
  name,
  legend,
  error,
}: {
  value: number | null;
  onChange: (value: number) => void;
  name: string;
  legend: string;
  error?: string | undefined;
}) {
  const t = useTranslations('ui.rating');
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-e` : undefined}>
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label key={star} className="group relative cursor-pointer">
            <input
              type="radio"
              name={name}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              className="peer absolute inset-0 cursor-pointer opacity-0"
            />
            <span className="sr-only">{t('starLabel', { count: star })}</span>
            <span className="grid size-11 place-items-center rounded-md peer-focus-visible:outline-[2.5px] peer-focus-visible:outline-pen peer-focus-visible:outline-solid">
              <StarIcon
                filled={value !== null && star <= value}
                className={cn(
                  'size-7',
                  value !== null && star <= value ? 'text-warning' : 'text-field',
                )}
              />
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={`${id}-e`} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
