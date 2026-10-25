'use client';

import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

import { CheckIcon } from './icons';

type CheckboxProps = Omit<ComponentProps<typeof CheckboxPrimitive.Root>, 'children'> & {
  label: ReactNode;
  description?: ReactNode;
  error?: string | undefined;
};

export function Checkbox({
  label,
  description,
  error,
  className,
  id: idProp,
  ...props
}: CheckboxProps) {
  const generated = useId();
  const id = idProp ?? generated;
  const descriptionId = description ? `${id}-d` : undefined;
  const errorId = error ? `${id}-e` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-start gap-3">
        <CheckboxPrimitive.Root
          id={id}
          aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
          aria-invalid={error ? true : undefined}
          className="peer mt-0.5 grid size-6 shrink-0 place-items-center rounded-xs border-[1.5px] border-field bg-paper-raised text-pen-ink transition-colors hover:border-ink aria-invalid:border-danger data-[state=checked]:border-pen data-[state=checked]:bg-pen"
          {...props}
        >
          <CheckboxPrimitive.Indicator>
            <CheckIcon className="size-4" strokeWidth={2.5} />
          </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
        <div className="flex min-h-7 flex-col justify-center">
          <label htmlFor={id} className="cursor-pointer text-[0.95rem] leading-snug text-ink">
            {label}
          </label>
          {description ? (
            <p id={descriptionId} className="mt-0.5 text-sm text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="pl-9 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
