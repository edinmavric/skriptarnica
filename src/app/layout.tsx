import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { siteConfig } from '@/config/site';
import { env } from '@/env';

import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
    title: { default: siteConfig.name, template: `%s · ${siteConfig.name}` },
    description: t('description'),
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const t = await getTranslations('a11y');
  return (
    <html lang={locale}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only">
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
