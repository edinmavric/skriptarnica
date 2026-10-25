import { sql } from 'drizzle-orm';

import { db } from '../db/client';

import { searchMatch, type SearchContext, type SearchResult } from './search';

/** Visibility for search: public communities, plus faculty_only ones of the viewer's faculty. */
function visibleFor(alias: string, ctx: SearchContext) {
  const c = sql.raw(alias);
  return ctx.viewerId
    ? sql`(${c}.visibility = 'public' OR ${c}.faculty_id = (SELECT faculty_id FROM student_profiles WHERE user_id = ${ctx.viewerId}))`
    : sql`${c}.visibility = 'public'`;
}

export async function searchCommunities(ctx: SearchContext): Promise<SearchResult[]> {
  const m = searchMatch('c', ctx);
  const rows = await db.execute<{
    id: string;
    name: string;
    slug: string;
    member_count: number;
    score: number;
  }>(sql`
    SELECT c.id, c.name, c.slug, c.member_count, ${m.score} AS score FROM communities c
    LEFT JOIN faculties f ON f.id = c.faculty_id
    WHERE ${m.where} AND ${visibleFor('c', ctx)} ${ctx.facultySlug ? sql`AND f.slug = ${ctx.facultySlug}` : sql``}
    ORDER BY score DESC, c.member_count DESC LIMIT ${ctx.limit}`);
  return rows.map((row) => ({
    type: 'community' as const,
    id: row.id,
    title: row.name,
    subtitle: null,
    href: `/z/${row.slug}`,
    score: Number(row.score),
  }));
}

export async function searchPosts(ctx: SearchContext): Promise<SearchResult[]> {
  const m = searchMatch('p', ctx);
  const rows = await db.execute<{
    id: string;
    title: string;
    slug: string;
    community_slug: string;
    community_name: string;
    score: number;
  }>(sql`
    SELECT p.id, p.title, p.slug, c.slug AS community_slug, c.name AS community_name, ${m.score} AS score FROM posts p
    JOIN communities c ON c.id = p.community_id
    LEFT JOIN faculties f ON f.id = c.faculty_id
    WHERE ${m.where} AND p.removed_at IS NULL AND p.deleted_at IS NULL AND ${visibleFor('c', ctx)} ${ctx.facultySlug ? sql`AND f.slug = ${ctx.facultySlug}` : sql``}
    ORDER BY score DESC, p.score DESC LIMIT ${ctx.limit}`);
  return rows.map((row) => ({
    type: 'post' as const,
    id: row.id,
    title: row.title,
    subtitle: row.community_name,
    href: `/z/${row.community_slug}/p/${row.id}-${row.slug}`,
    score: Number(row.score),
  }));
}
