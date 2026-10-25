import { sql } from 'drizzle-orm';

import { db } from '../db/client';

import { searchMatch, type SearchContext, type SearchResult } from './search';

/** Notes in global search: published only (unlisted notes are reachable by link only). */
export async function searchNotes(ctx: SearchContext): Promise<SearchResult[]> {
  const m = searchMatch('n', ctx);
  const rows = await db.execute<{
    id: string;
    title: string;
    slug: string;
    course: string | null;
    faculty_short: string | null;
    price_para: number;
    score: number;
  }>(sql`
    SELECT n.id, n.title, n.slug, c.name AS course, f.short_name AS faculty_short, n.price_para, ${m.score} AS score
    FROM notes n
    LEFT JOIN courses c ON c.id = n.course_id
    LEFT JOIN faculties f ON f.id = c.faculty_id
    WHERE n.status = 'published' AND n.deleted_at IS NULL AND ${m.where}
      ${ctx.facultySlug ? sql`AND f.slug = ${ctx.facultySlug}` : sql``}
    ORDER BY score DESC, n.sales_count DESC LIMIT ${ctx.limit}`);
  return rows.map((row) => ({
    type: 'note' as const,
    id: row.id,
    title: row.title,
    subtitle: [row.course, row.faculty_short].filter(Boolean).join(', ') || null,
    href: `/skripta/${row.slug}`,
    score: Number(row.score) + 0.2,
  }));
}
