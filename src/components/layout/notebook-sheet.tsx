'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type Paper = 'ruled' | 'grid' | 'plain';

/** Which paper a page is written on: squares for numbers, plain for forms, lines for reading. */
function paperFor(pathname: string): Paper {
  if (pathname.startsWith('/prodaja/postani-prodavac')) return 'plain';
  if (pathname.startsWith('/prodaja')) return 'grid';
  if (
    pathname.startsWith('/podesavanja') ||
    pathname.startsWith('/kupovina') ||
    pathname.startsWith('/pocetak')
  )
    return 'plain';
  return 'ruled';
}

/**
 * One sheet of the notebook the site is drawn as: paper with a red margin, spiral binding on the
 * left and highlighter register tabs on the right (both decorative, wide screens only).
 */
export function NotebookSheet({
  children,
  paper,
  className,
  registers = true,
}: {
  children: ReactNode;
  /** Fixed paper; by default it follows the current page. */
  paper?: Paper;
  className?: string;
  registers?: boolean;
}) {
  const pathname = usePathname();
  return (
    <div data-paper={paper ?? paperFor(pathname)} className={cn('sheet', className)}>
      <span aria-hidden="true" className="spiral hidden md:block" />
      {registers ? (
        <span aria-hidden="true" className="registers hidden xl:flex">
          <i className="bg-marker" />
          <i className="bg-pink" />
          <i className="bg-mint" />
          <i className="bg-orange" />
        </span>
      ) : null}
      {children}
    </div>
  );
}
