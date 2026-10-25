import type { MetadataRoute } from 'next';

import { env } from '@/env';

/** Public catalog/notes/communities are indexable; private areas are not (SPEC §8.3). */
export default function robots(): MetadataRoute.Robots {
  // Preview deployments must never be indexed.
  if (env.APP_ENV === 'preview') {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/dev/',
          '/biblioteka',
          '/sacuvano',
          '/podesavanja',
          '/obavestenja',
          '/prodaja',
          '/pocetak',
          '/prijava',
          '/registracija',
          '/pretraga',
          '/kupovina',
        ],
      },
    ],
    sitemap: `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
    host: env.NEXT_PUBLIC_APP_URL,
  };
}
