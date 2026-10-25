import { sql, type SQL } from 'drizzle-orm';

import { normalizeForSearch, toPrefixTsQuery } from '@/lib/search/normalize';

import { db } from '../db/client';

/**
 * Global search (SPEC §4.6): Postgres FTS with the `simple` config over app-normalized text
 * (no diacritics, Cyrillic→Latin) + pg_trgm for fuzzy/prefix matches. Each entity type is a
 * provider; later phases register notes, communities and posts.
 */

export type SearchResultType =
  'note' | 'course' | 'professor' | 'faculty' | 'university' | 'community' | 'post';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
  score: number;
}

export interface SearchContext {
  /** Normalized query text ("cacak"). */
  text: string;
  /** Prefix tsquery ("cacak:*"). */
  tsquery: string;
  limit: number;
  /** Signed-in user, for providers that must apply visibility rules. */
  viewerId: string | null;
  /** Optional faculty filter (landing page faculty selector). */
  facultySlug: string | null;
}

type Provider = (ctx: SearchContext) => Promise<SearchResult[]>;

/** Shared WHERE + score expression for a table with search_text/search_tsv columns. */
export function searchMatch(table: string, ctx: SearchContext): { where: SQL; score: SQL } {
  const t = sql.raw(table);
  const like = `%${ctx.text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return {
    where: sql`(${t}.search_tsv @@ to_tsquery('simple', ${ctx.tsquery}) OR ${t}.search_text % ${ctx.text} OR ${t}.search_text LIKE ${like})`,
    score: sql`(ts_rank(${t}.search_tsv, to_tsquery('simple', ${ctx.tsquery})) + similarity(${t}.search_text, ${ctx.text}) + CASE WHEN ${t}.search_text LIKE ${`${ctx.text}%`} THEN 0.5 ELSE 0 END)`,
  };
}

const courseProvider: Provider = async (ctx) => {
  const m = searchMatch('c', ctx);
  const rows = await db.execute<{
    id: string;
    name: string;
    code: string | null;
    slug: string;
    faculty_slug: string;
    faculty_short: string;
    score: number;
  }>(sql`
    SELECT c.id, c.name, c.code, c.slug, f.slug AS faculty_slug, f.short_name AS faculty_short, ${m.score} AS score
    FROM courses c JOIN faculties f ON f.id = c.faculty_id
    WHERE ${m.where} ${ctx.facultySlug ? sql`AND f.slug = ${ctx.facultySlug}` : sql``}
    ORDER BY score DESC, c.name LIMIT ${ctx.limit}`);
  return rows.map((row) => ({
    type: 'course' as const,
    id: row.id,
    title: row.name,
    subtitle: row.code ? `${row.faculty_short}, ${row.code}` : row.faculty_short,
    href: `/f/${row.faculty_slug}/predmet/${row.slug}`,
    score: Number(row.score),
  }));
};

const professorProvider: Provider = async (ctx) => {
  const m = searchMatch('p', ctx);
  const rows = await db.execute<{
    id: string;
    name: string;
    title: string | null;
    slug: string;
    faculty_slug: string;
    faculty_short: string;
    score: number;
  }>(sql`
    SELECT p.id, p.name, p.title, p.slug, f.slug AS faculty_slug, f.short_name AS faculty_short, ${m.score} AS score
    FROM professors p JOIN faculties f ON f.id = p.faculty_id
    WHERE ${m.where} ${ctx.facultySlug ? sql`AND f.slug = ${ctx.facultySlug}` : sql``}
    ORDER BY score DESC, p.name LIMIT ${ctx.limit}`);
  return rows.map((row) => ({
    type: 'professor' as const,
    id: row.id,
    title: row.title ? `${row.title} ${row.name}` : row.name,
    subtitle: row.faculty_short,
    href: `/f/${row.faculty_slug}/profesor/${row.slug}`,
    score: Number(row.score),
  }));
};

const facultyProvider: Provider = async (ctx) => {
  const m = searchMatch('f', ctx);
  const rows = await db.execute<{
    id: string;
    name: string;
    city: string;
    slug: string;
    university: string;
    score: number;
  }>(sql`
    SELECT f.id, f.name, f.city, f.slug, u.name AS university, ${m.score} AS score
    FROM faculties f JOIN universities u ON u.id = f.university_id
    WHERE ${m.where}
    ORDER BY score DESC, f.name LIMIT ${ctx.limit}`);
  return rows.map((row) => ({
    type: 'faculty' as const,
    id: row.id,
    title: row.name,
    subtitle: `${row.university}, ${row.city}`,
    href: `/f/${row.slug}`,
    score: Number(row.score),
  }));
};

const universityProvider: Provider = async (ctx) => {
  const m = searchMatch('u', ctx);
  const rows = await db.execute<{
    id: string;
    name: string;
    city: string;
    slug: string;
    score: number;
  }>(sql`
    SELECT u.id, u.name, u.city, u.slug, ${m.score} AS score FROM universities u
    WHERE ${m.where} ORDER BY score DESC, u.name LIMIT ${ctx.limit}`);
  return rows.map((row) => ({
    type: 'university' as const,
    id: row.id,
    title: row.name,
    subtitle: row.city,
    href: `/univerzitet/${row.slug}`,
    score: Number(row.score),
  }));
};

const providers = new Map<SearchResultType, Provider>([
  ['course', courseProvider],
  ['professor', professorProvider],
  ['faculty', facultyProvider],
  ['university', universityProvider],
]);

/** Later phases add notes/communities/posts here. */
export function registerSearchProvider(type: SearchResultType, provider: Provider): void {
  providers.set(type, provider);
}

export const SEARCH_GROUP_ORDER: SearchResultType[] = [
  'note',
  'course',
  'professor',
  'community',
  'post',
  'faculty',
  'university',
];

export interface SearchResponse {
  query: string;
  groups: { type: SearchResultType; results: SearchResult[] }[];
}

export async function search(
  rawQuery: string,
  options: {
    types?: SearchResultType[];
    limitPerType?: number;
    viewerId?: string | null;
    facultySlug?: string | null;
  } = {},
): Promise<SearchResponse> {
  const text = normalizeForSearch(rawQuery);
  const tsquery = toPrefixTsQuery(rawQuery);
  if (!tsquery || text.length < 2) return { query: rawQuery, groups: [] };
  const ctx: SearchContext = {
    text,
    tsquery,
    limit: options.limitPerType ?? 5,
    viewerId: options.viewerId ?? null,
    facultySlug: options.facultySlug ?? null,
  };
  const types = (options.types ?? SEARCH_GROUP_ORDER).filter((type) => providers.has(type));
  const results = await Promise.all(
    types.map(async (type) => ({ type, results: await (providers.get(type) as Provider)(ctx) })),
  );
  return {
    query: rawQuery,
    groups: SEARCH_GROUP_ORDER.flatMap((type) =>
      results.filter((group) => group.type === type && group.results.length > 0),
    ),
  };
}
