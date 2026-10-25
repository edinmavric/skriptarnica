import { getRequestConfig } from 'next-intl/server';

import { siteConfig } from '@/config/site';

import messages from './messages/sr-Latn.json';

export default getRequestConfig(() =>
  Promise.resolve({
    locale: siteConfig.defaultLocale,
    timeZone: siteConfig.timeZone,
    messages,
  }),
);
