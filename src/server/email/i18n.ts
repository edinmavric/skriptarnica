import { createTranslator } from 'next-intl';

import { siteConfig } from '@/config/site';
import messages from '@/i18n/messages/sr-Latn.json';

/** Translator usable outside a request (jobs, auth callbacks). */
export function emailTranslator() {
  return createTranslator({ locale: siteConfig.defaultLocale, messages, namespace: 'email' });
}

export type EmailT = ReturnType<typeof emailTranslator>;
