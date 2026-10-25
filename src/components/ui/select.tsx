'use client';

import type { Ref, SelectHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

import { useField } from './field';
import { ChevronDownIcon } from './icons';
import { controlClasses } from './input';

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

/** Native select, styled: the most accessible option on mobile for short lists. */
export function Select({ className, id, children, ...props }: SelectProps) {
  const field = useField();
  return (
    <div className="relative">
      <select
        id={id ?? field?.id}
        aria-invalid={field?.invalid || undefined}
        aria-describedby={field?.describedBy}
        className={cn(controlClasses, 'min-h-11 appearance-none pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-muted" />
    </div>
  );
}
