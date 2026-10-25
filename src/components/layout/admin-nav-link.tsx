'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** Active when on the item's page or below it; "/admin" only on exactly /admin. */
export function AdminNavLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const current =
    href === '/admin'
      ? pathname === href
      : pathname === href ||
        (pathname.startsWith(`${href}/`) &&
          !(href === '/admin/katalog' && pathname.startsWith('/admin/katalog/zahtevi')));
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'block min-h-11 rounded-md px-3 py-2.5 text-sm whitespace-nowrap hover:bg-paper-sunk',
        current && 'bg-paper-sunk font-semibold',
      )}
    >
      {children}
    </Link>
  );
}
