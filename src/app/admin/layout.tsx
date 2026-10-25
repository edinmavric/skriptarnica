import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import { AdminShell } from '@/components/layout/admin-shell';
import { clientMessages } from '@/i18n/client-messages';
import { requireAdmin } from '@/server/auth/admin';

export const metadata: Metadata = {
  title: 'Administracija',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return (
    <NextIntlClientProvider messages={await clientMessages('admin')}>
      <AdminShell>{children}</AdminShell>
    </NextIntlClientProvider>
  );
}
