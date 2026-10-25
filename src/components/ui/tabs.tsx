'use client';

import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <TabsPrimitive.List
      aria-label={label}
      className={cn('flex gap-1 overflow-x-auto border-b border-rule', className)}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px min-h-11 border-b-[2.5px] border-transparent px-3 text-[0.95rem] whitespace-nowrap text-ink-muted hover:text-ink data-[state=active]:border-ink data-[state=active]:font-medium data-[state=active]:text-ink',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('pt-4', className)} {...props} />;
}
