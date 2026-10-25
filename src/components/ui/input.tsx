'use client';

import type { InputHTMLAttributes, Ref, TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

import { useField } from './field';

export const controlClasses =
  'w-full rounded-md border border-field bg-paper-raised px-3 text-[0.95rem] text-ink placeholder:text-ink-faint transition-colors hover:border-ink focus-visible:border-pen focus-visible:outline-2 focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:bg-paper-sunk disabled:opacity-70 aria-invalid:border-danger';

type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> };

export function Input({ className, id, ...props }: InputProps) {
  const field = useField();
  return (
    <input
      id={id ?? field?.id}
      aria-invalid={field?.invalid || props['aria-invalid'] || undefined}
      aria-describedby={
        [field?.describedBy, props['aria-describedby']].filter(Boolean).join(' ') || undefined
      }
      className={cn(controlClasses, 'min-h-11', className)}
      {...props}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: Ref<HTMLTextAreaElement>;
};

export function Textarea({ className, id, rows = 5, ...props }: TextareaProps) {
  const field = useField();
  return (
    <textarea
      id={id ?? field?.id}
      rows={rows}
      aria-invalid={field?.invalid || props['aria-invalid'] || undefined}
      aria-describedby={
        [field?.describedBy, props['aria-describedby']].filter(Boolean).join(' ') || undefined
      }
      className={cn(controlClasses, 'py-2.5 leading-relaxed', className)}
      {...props}
    />
  );
}
