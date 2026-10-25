'use client';

import { DropdownMenu as Menu } from 'radix-ui';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export const DropdownRoot = Menu.Root;
export const DropdownTrigger = Menu.Trigger;

export function DropdownContent({
  children,
  align = 'end',
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 min-w-52 rounded-md border border-rule bg-paper-raised p-1 shadow-lift data-[state=open]:animate-pop-in',
          className,
        )}
      >
        {children}
      </Menu.Content>
    </Menu.Portal>
  );
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  disabled,
  asChild,
}: {
  children: ReactNode;
  onSelect?: (event: Event) => void;
  danger?: boolean;
  disabled?: boolean;
  asChild?: boolean;
}) {
  return (
    <Menu.Item
      {...(onSelect ? { onSelect } : {})}
      disabled={disabled}
      asChild={asChild}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm px-3 text-[0.95rem] outline-none select-none data-[disabled]:opacity-50 data-[highlighted]:bg-paper-sunk [&_svg]:size-[1.1em]',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      {children}
    </Menu.Item>
  );
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className="px-3 pt-2 pb-1 text-sm text-ink-muted">{children}</Menu.Label>;
}

export function DropdownSeparator() {
  return <Menu.Separator className="my-1 h-px bg-rule" />;
}
