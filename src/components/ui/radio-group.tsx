'use client';

import { RadioGroup as RadioPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

type RadioGroupProps = ComponentProps<typeof RadioPrimitive.Root> & {
  legend: ReactNode;
  hideLegend?: boolean;
  options: RadioOption[];
  error?: string | undefined;
};

export function RadioGroup({
  legend,
  hideLegend,
  options,
  error,
  className,
  ...props
}: RadioGroupProps) {
  const id = useId();
  return (
    <fieldset className={cn('flex flex-col gap-2', className)}>
      <legend className={cn('mb-1 text-sm font-medium text-ink', hideLegend && 'sr-only')}>
        {legend}
      </legend>
      <RadioPrimitive.Root
        className="flex flex-col gap-2"
        aria-describedby={error ? `${id}-e` : undefined}
        {...props}
      >
        {options.map((option) => {
          const optionId = `${id}-${option.value}`;
          return (
            <div key={option.value} className="flex items-start gap-3">
              <RadioPrimitive.Item
                id={optionId}
                value={option.value}
                disabled={option.disabled}
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-field bg-paper-raised hover:border-ink disabled:opacity-50 data-[state=checked]:border-pen"
              >
                <RadioPrimitive.Indicator className="size-3 rounded-full bg-pen" />
              </RadioPrimitive.Item>
              <label
                htmlFor={optionId}
                className="flex min-h-7 cursor-pointer flex-col justify-center"
              >
                <span className="text-[0.95rem] leading-snug">{option.label}</span>
                {option.description ? (
                  <span className="text-sm text-ink-muted">{option.description}</span>
                ) : null}
              </label>
            </div>
          );
        })}
      </RadioPrimitive.Root>
      {error ? (
        <p id={`${id}-e`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
