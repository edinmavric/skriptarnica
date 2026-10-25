import { and, eq, isNull } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { db } from '@/server/db/client';
import { communities, posts } from '@/server/db/schema';
import { OG_SIZE, renderOg } from '@/server/seo/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Objava';

/** Never shows an author (anonymous posts stay anonymous here too). */
export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; post: string }>;
}) {
  const { post: param } = await params;
  const t = await getTranslations('og');
  const id = param.slice(0, 36);
  const [row] = /^[0-9a-f-]{36}$/.test(id)
    ? await db
        .select({
          title: posts.title,
          comments: posts.commentCount,
          community: communities.slug,
          visibility: communities.visibility,
        })
        .from(posts)
        .innerJoin(communities, eq(communities.id, posts.communityId))
        .where(and(eq(posts.id, id), isNull(posts.removedAt), isNull(posts.deletedAt)))
    : [];
  if (!row || row.visibility !== 'public')
    return renderOg({ kicker: t('defaultKicker'), title: t('defaultTitle') });
  return renderOg({
    kicker: `z/${row.community}`,
    title: row.title,
    details: t('comments', { count: row.comments }),
  });
}
