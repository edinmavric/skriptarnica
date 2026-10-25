import type { MetadataRoute } from 'next';

import { siteConfig } from '@/config/site';
import messages from '@/i18n/messages/sr-Latn.json';

/**
 * Installable PWA (SPEC §8.4). No service worker caching: paid files are never stored offline,
 * and every page needs fresh auth anyway.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.name,
    description: messages.meta.description,
    lang: 'sr-Latn',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fbfaf5',
    theme_color: '#fbfaf5',
    categories: ['education'],
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
