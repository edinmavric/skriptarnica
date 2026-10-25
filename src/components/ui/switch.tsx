'use client';

import { Switch as SwitchPrimitive } from 'radix-ui';
import { useId, type ComponentProps, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

type SwitchProps = ComponentProps<typeof SwitchPrimitive.Root> & {
  label: ReactNode;
  description?: ReactNode;
};

export function Switch({ label, description, className, id: idProp, ...props }: SwitchProps) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <div className="flex flex-col">
        <label htmlFor={id} className="cursor-pointer text-[0.95rem] text-ink">
          {label}
        </label>
        {description ? (
          <span id={`${id}-d`} className="text-sm text-ink-muted">
            {description}
          </span>
        ) : null}
      </div>
      <SwitchPrimitive.Root
        id={id}
        aria-describedby={description ? `${id}-d` : undefined}
        className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-[1.5px] border-field bg-paper-sunk transition-colors disabled:opacity-50 data-[state=checked]:border-pen data-[state=checked]:bg-pen"
        {...props}
      >
        <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-ink-muted shadow-sm transition-transform data-[state=checked]:translate-x-[1.35rem] data-[state=checked]:bg-pen-ink" />
      </SwitchPrimitive.Root>
    </div>
  );
}
