import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Empty state with one clear action (SPEC §6.3). The sketch is a simple pen line drawing. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-dashed border-rule-strong px-5 py-8 sm:items-center sm:text-center',
        className,
      )}
    >
      <svg
        viewBox="0 0 120 64"
        className="h-14 w-auto text-ink-faint"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <path d="M14 8.5h58.5l9 9V58H14z" />
        <path d="M72 8.8V18h9.2" />
        <path d="M22 26h40M22 33.5h46M22 41h30" strokeOpacity=".55" />
        <path d="m83 46 22-22 6 6-22 22-8 2z" />
        <path d="m101 28 6 6" />
      </svg>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {description ? <p className="max-w-prose text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
