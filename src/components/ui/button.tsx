import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ButtonHTMLAttributes, Ref } from 'react';

import { cn } from '@/lib/cn';

import { Spinner } from './spinner';

export const buttonVariants = cva(
  'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-[0.95rem] font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55 [&_svg]:size-[1.15em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-pen text-pen-ink hover:bg-pen-hover',
        secondary:
          'border border-field bg-paper-raised text-ink hover:border-ink hover:bg-paper-sunk',
        ghost: 'text-ink hover:bg-paper-sunk',
        danger: 'bg-danger text-danger-ink hover:opacity-90',
        link: 'min-h-0 px-0 text-pen underline underline-offset-4',
      },
      size: {
        sm: 'min-h-9 px-3 text-sm',
        md: '',
        lg: 'min-h-12 px-5 text-base',
        icon: 'size-11 px-0',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  /** Render as the child element (e.g. a Link) with button styling. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  asChild = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}
