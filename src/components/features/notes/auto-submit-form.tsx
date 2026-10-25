'use client';

import type { ReactNode } from 'react';

/** A GET form that submits when any control changes (still works without JS via its button). */
export function AutoSubmitForm({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <form
      method="get"
      role="search"
      aria-label={label}
      className={className}
      onChange={(event) => event.currentTarget.requestSubmit()}
    >
      {children}
    </form>
  );
}
