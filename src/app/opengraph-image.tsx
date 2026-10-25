import { getTranslations } from 'next-intl/server';

import { OG_SIZE, renderOg } from '@/server/seo/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Skriptarnica';

/** Default card for every page without its own. */
export default async function Image() {
  const t = await getTranslations('og');
  return renderOg({
    kicker: t('defaultKicker'),
    title: t('defaultTitle'),
    details: t('defaultDetails'),
  });
}
