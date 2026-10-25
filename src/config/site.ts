/**
 * Site identity. The product name lives here and nowhere else.
 * "Skriptarnica" is a working name; replace before launch.
 */
export const siteConfig = {
  name: 'Skriptarnica',
  defaultLocale: 'sr-Latn',
  locales: ['sr-Latn'] as const,
  timeZone: 'Europe/Belgrade',
  currency: 'RSD',
} as const;

export type Locale = (typeof siteConfig.locales)[number];
