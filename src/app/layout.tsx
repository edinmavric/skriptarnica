import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { siteConfig } from '@/config/site';
import { env } from '@/env';
import { cn } from '@/lib/cn';
import { parseTheme, THEME_COOKIE } from '@/lib/theme';

import { golos, jetbrains, piazzolla } from './fonts';

import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
    title: { default: siteConfig.name, template: `%s | ${siteConfig.name}` },
    description: t('description'),
    applicationName: siteConfig.name,
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf5' },
    { media: '(prefers-color-scheme: dark)', color: '#1e1d1a' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, t, cookieStore] = await Promise.all([
    getLocale(),
    getTranslations('a11y'),
    cookies(),
  ]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  return (
    <html
      lang={locale}
      data-theme={theme}
      className={cn(piazzolla.variable, golos.variable, jetbrains.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only z-[100] rounded-md bg-pen px-4 py-3 text-pen-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider>
          <TooltipProvider>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
