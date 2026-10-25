import { eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { db } from '@/server/db/client';
import { communities } from '@/server/db/schema';
import { OG_SIZE, renderOg } from '@/server/seo/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Zajednica';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations('og');
  const [community] = await db.select().from(communities).where(eq(communities.slug, slug));
  // Faculty-only communities don't reveal anything beyond the generic card.
  if (!community || community.visibility !== 'public')
    return renderOg({ kicker: t('defaultKicker'), title: t('defaultTitle') });
  return renderOg({
    kicker: `z/${community.slug}`,
    title: community.name,
    details: t('members', { count: community.memberCount }),
  });
}
