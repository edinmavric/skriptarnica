/**
 * Registers every sitemap segment (side effects). Catalog segments live in ./sitemap.
 */
import { and, desc, eq, isNull } from 'drizzle-orm';

import { routes } from '@/config/routes';

import { db } from '../db/client';
import { communities, notes, posts } from '../db/schema';

import { registerSitemapSegment } from './sitemap';

registerSitemapSegment('notes', async () => {
  const rows = await db
    .select({ slug: notes.slug, updatedAt: notes.updatedAt })
    .from(notes)
    .where(and(eq(notes.status, 'published'), isNull(notes.deletedAt)));
  return rows.map((row) => ({
    path: routes.note(row.slug),
    lastModified: row.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }));
});

registerSitemapSegment('communities', async () => {
  const rows = await db
    .select({ slug: communities.slug, updatedAt: communities.updatedAt })
    .from(communities)
    .where(eq(communities.visibility, 'public'));
  return rows.map((row) => ({
    path: routes.community(row.slug),
    lastModified: row.updatedAt,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));
});

registerSitemapSegment('posts', async () => {
  const rows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      communitySlug: communities.slug,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .innerJoin(communities, eq(communities.id, posts.communityId))
    .where(
      and(eq(communities.visibility, 'public'), isNull(posts.removedAt), isNull(posts.deletedAt)),
    )
    .orderBy(desc(posts.createdAt))
    .limit(45_000);
  return rows.map((row) => ({
    path: routes.post(row.communitySlug, row.id, row.slug),
    lastModified: row.updatedAt,
    priority: 0.5,
  }));
});
