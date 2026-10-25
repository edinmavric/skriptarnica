/**
 * Registers every sitemap segment (side effects). Catalog segments live in ./sitemap.
 */
import { and, eq, isNull } from 'drizzle-orm';

import { routes } from '@/config/routes';

import { db } from '../db/client';
import { notes } from '../db/schema';

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
