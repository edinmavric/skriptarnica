import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AdminShell } from '@/components/layout/admin-shell';
import { requireAdmin } from '@/server/auth/admin';

export const metadata: Metadata = {
  title: 'Administracija',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <AdminShell>{children}</AdminShell>;
}
