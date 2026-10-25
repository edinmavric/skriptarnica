import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';

import { clientMessages } from '@/i18n/client-messages';
import { assertDevRoutes } from '@/lib/dev';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DevLayout({ children }: { children: ReactNode }) {
  assertDevRoutes();
  return (
    <NextIntlClientProvider messages={await clientMessages('dev')}>
      {children}
    </NextIntlClientProvider>
  );
}
