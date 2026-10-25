import type { siteConfig } from '@/config/site';

import type messages from './messages/sr-Latn.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: (typeof siteConfig.locales)[number];
    Messages: typeof messages;
  }
}
