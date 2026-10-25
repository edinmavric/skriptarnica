import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import { revalidateTag, unstable_cache } from 'next/cache';

import type { NoteCardData } from '@/components/ui/note-card';
import type { CourseNotesQuery } from '@/lib/validation/notes';

import type { CurrentUser } from '../auth/session';
import { db } from '../db/client';
import {
  bookmarks,
  courses,
  entitlements,
  faculties,
  notePreviews,
  notes,
  noteVersions,
  professors,
  userCourseStatus,
  users,
} from '../db/schema';
import { canViewNote } from '../policies';
import { publicUrl } from '../storage/s3';

export const NOTES_TAG = 'notes';

/** Bayesian average (SPEC §4.5): prior of 5 reviews at 4.0, so one 5★ doesn't beat 40 × 4.7. */
export const BAYES_PRIOR_WEIGHT = 5;
export const BAYES_PRIOR_MEAN = 4;
export const bayesianRatingSql = sql<number>`((${notes.ratingSum} + ${BAYES_PRIOR_WEIGHT * BAYES_PRIOR_MEAN})::float / (${notes.reviewCount} + ${BAYES_PRIOR_WEIGHT}))`;

export function bayesianRating(ratingSum: number, reviewCount: number): number {
  return (ratingSum + BAYES_PRIOR_WEIGHT * BAYES_PRIOR_MEAN) / (reviewCount + BAYES_PRIOR_WEIGHT);
}

export function averageRating(ratingSum: number, reviewCount: number): number | null {
  return reviewCount > 0 ? Math.round((ratingSum / reviewCount) * 10) / 10 : null;
}

/** Cover = first preview page of the current version. */
async function coversFor(versionIds: string[]): Promise<Map<string, string>> {
  if (versionIds.length === 0) return new Map();
  const rows = await db
    .select({ versionId: notePreviews.noteVersionId, key: notePreviews.imageKey })
    .from(notePreviews)
    .where(and(inArray(notePreviews.noteVersionId, versionIds), eq(notePreviews.pageNumber, 1)));
  return new Map(rows.map((row) => [row.versionId, publicUrl(row.key)]));
}

/** Whether each seller marked the course as passed (badge next to the self-reported grade). */
async function passedMarks(
  pairs: { sellerId: string; courseId: string | null }[],
): Promise<Set<string>> {
  const valid = pairs.filter((pair): pair is { sellerId: string; courseId: string } =>
    Boolean(pair.courseId),
  );
  if (valid.length === 0) return new Set();
  const rows = await db
    .select({ userId: userCourseStatus.userId, courseId: userCourseStatus.courseId })
    .from(userCourseStatus)
    .where(
      and(
        eq(userCourseStatus.status, 'passed'),
        inArray(userCourseStatus.userId, [...new Set(valid.map((p) => p.sellerId))]),
        inArray(userCourseStatus.courseId, [...new Set(valid.map((p) => p.courseId))]),
      ),
    );
  return new Set(rows.map((row) => `${row.userId}:${row.courseId}`));
}

export const noteCardColumns = {
  id: notes.id,
  slug: notes.slug,
  title: notes.title,
  shortDescription: notes.shortDescription,
  sellerId: notes.sellerId,
  courseId: notes.courseId,
  currentVersionId: notes.currentVersionId,
  pricePara: notes.pricePara,
  grade: notes.grade,
  pageCount: notes.pageCount,
  ratingSum: notes.ratingSum,
  reviewCount: notes.reviewCount,
  salesCount: notes.salesCount,
  publishedAt: notes.publishedAt,
  courseName: courses.name,
  facultyShortName: faculties.shortName,
  sellerName: users.name,
};

export type NoteCardRow = {
  id: string;
  slug: string;
  title: string;
  shortDescription?: string | null;
  sellerId: string;
  courseId: string | null;
  currentVersionId: string | null;
  pricePara: number;
  grade: number | null;
  pageCount: number;
  ratingSum: number;
  reviewCount: number;
  courseName: string | null;
  facultyShortName: string | null;
  sellerName: string;
};

/** Turns DB rows into NoteCard view models (covers + "passed" badges in two batched queries). */
export async function toNoteCards(
  rows: NoteCardRow[],
  ownedNoteIds: Set<string> = new Set(),
): Promise<(NoteCardData & { id: string })[]> {
  const [covers, passed] = await Promise.all([
    coversFor(rows.flatMap((row) => (row.currentVersionId ? [row.currentVersionId] : []))),
    passedMarks(rows.map((row) => ({ sellerId: row.sellerId, courseId: row.courseId }))),
  ]);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.shortDescription ?? '',
    courseName: row.courseName ?? '',
    facultyShortName: row.facultyShortName ?? '',
    coverUrl: row.currentVersionId ? (covers.get(row.currentVersionId) ?? null) : null,
    sellerName: row.sellerName,
    averageRating: averageRating(row.ratingSum, row.reviewCount),
    reviewCount: row.reviewCount,
    pricePara: row.pricePara,
    grade: row.grade,
    gradeVerifiedByCourseStatus: passed.has(`${row.sellerId}:${row.courseId}`),
    pageCount: row.pageCount,
    owned: ownedNoteIds.has(row.id),
  }));
}

export function publishedNotesBase() {
  return db
    .select(noteCardColumns)
    .from(notes)
    .innerJoin(users, eq(users.id, notes.sellerId))
    .leftJoin(courses, eq(courses.id, notes.courseId))
    .leftJoin(faculties, eq(faculties.id, courses.facultyId));
}

export const PAGE_SIZE = 20;

const priceFilters: Record<string, SQL | undefined> = {
  besplatne: eq(notes.pricePara, 0),
  do500: lte(notes.pricePara, 50_000),
  do1000: lte(notes.pricePara, 100_000),
};

/** "Recommended" order: Bayesian rating, plus sales and freshness as smaller nudges. */
const recommendedSql = sql`(${bayesianRatingSql} + 0.35 * ln(1 + ${notes.salesCount}) + 0.5 * exp(-extract(epoch from now() - ${notes.publishedAt}) / (86400 * 180)))`;

/** The best notes across all courses, in recommended order; optionally not the viewer's own. */
export const listTopNotes = unstable_cache(
  async (limit: number, excludeSellerId: string | null = null) => {
    const rows = await publishedNotesBase()
      .where(
        and(
          eq(notes.status, 'published'),
          isNull(notes.deletedAt),
          excludeSellerId ? ne(notes.sellerId, excludeSellerId) : undefined,
        ),
      )
      .orderBy(desc(recommendedSql), desc(notes.id))
      .limit(limit);
    return toNoteCards(rows);
  },
  ['top-notes'],
  { tags: [NOTES_TAG], revalidate: 300 },
);

/** Course page listing (SPEC §4.3): filters and sorts over published notes. */
export const listCourseNotes = unstable_cache(
  async (courseId: string, query: CourseNotesQuery) => {
    const conditions: SQL[] = [
      eq(notes.courseId, courseId),
      eq(notes.status, 'published'),
      isNull(notes.deletedAt),
    ];
    if (query.profesor) conditions.push(eq(notes.professorId, query.profesor));
    const price = query.cena ? priceFilters[query.cena] : undefined;
    if (price) conditions.push(price);
    if (query.ocena) {
      conditions.push(gte(notes.reviewCount, 1));
      conditions.push(
        sql`${notes.ratingSum}::float / nullif(${notes.reviewCount}, 0) >= ${Number(query.ocena)}`,
      );
    }
    if (query.godina) conditions.push(eq(notes.academicYear, query.godina));

    const order: SQL[] = {
      preporuceno: [desc(recommendedSql)],
      ocena: [desc(bayesianRatingSql), desc(notes.reviewCount)],
      prodaja: [desc(notes.salesCount)],
      najnovije: [desc(notes.publishedAt)],
      'cena-rastuce': [asc(notes.pricePara)],
      'cena-opadajuce': [desc(notes.pricePara)],
    }[query.sort ?? 'preporuceno'];

    const page = query.strana ?? 1;
    const [rows, [count]] = await Promise.all([
      publishedNotesBase()
        .where(and(...conditions))
        .orderBy(...order, desc(notes.id))
        .limit(PAGE_SIZE)
        .offset((page - 1) * PAGE_SIZE),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(notes)
        .where(and(...conditions)),
    ]);
    const academicYears = await db
      .selectDistinct({ year: notes.academicYear })
      .from(notes)
      .where(
        and(
          eq(notes.courseId, courseId),
          eq(notes.status, 'published'),
          isNotNull(notes.academicYear),
        ),
      )
      .orderBy(desc(notes.academicYear));
    return {
      cards: await toNoteCards(rows),
      total: count?.n ?? 0,
      page,
      pageCount: Math.max(1, Math.ceil((count?.n ?? 0) / PAGE_SIZE)),
      academicYears: academicYears.flatMap((row) => (row.year ? [row.year] : [])),
    };
  },
  ['course-notes'],
  { tags: [NOTES_TAG], revalidate: 300 },
);

export interface NotePageData {
  note: typeof notes.$inferSelect;
  course: { name: string; slug: string; code: string | null } | null;
  faculty: { name: string; shortName: string; slug: string } | null;
  professor: { name: string; title: string | null; slug: string } | null;
  seller: {
    id: string;
    name: string;
    username: string | null;
    image: string | null;
    publishedNotes: number;
    totalSales: number;
    averageRating: number | null;
  };
  gradeVerified: boolean;
  previews: { pageNumber: number; url: string; width: number; height: number; blurred: boolean }[];
  versions: { versionNumber: number; changelog: string | null; publishedAt: Date | null }[];
  lastUpdated: Date | null;
  viewer: { isOwner: boolean; bookmarked: boolean; owned: boolean };
}

/** Note page read model; access is checked with canViewNote (drafts are 404 for others). */
export async function getNotePage(
  slug: string,
  viewer: CurrentUser | null,
): Promise<NotePageData | null> {
  const [row] = await db
    .select({
      note: notes,
      course: courses,
      faculty: faculties,
      professor: professors,
      seller: users,
    })
    .from(notes)
    .innerJoin(users, eq(users.id, notes.sellerId))
    .leftJoin(courses, eq(courses.id, notes.courseId))
    .leftJoin(faculties, eq(faculties.id, courses.facultyId))
    .leftJoin(professors, eq(professors.id, notes.professorId))
    .where(eq(notes.slug, slug));
  if (!row || !canViewNote(viewer, row.note).allowed) return null;
  const { note } = row;

  const [previews, versions, [sellerStats], passed, bookmark] = await Promise.all([
    note.currentVersionId
      ? db
          .select()
          .from(notePreviews)
          .where(eq(notePreviews.noteVersionId, note.currentVersionId))
          .orderBy(asc(notePreviews.pageNumber))
      : Promise.resolve([]),
    db
      .select({
        versionNumber: noteVersions.versionNumber,
        changelog: noteVersions.changelog,
        publishedAt: noteVersions.publishedAt,
      })
      .from(noteVersions)
      .where(and(eq(noteVersions.noteId, note.id), isNotNull(noteVersions.publishedAt)))
      .orderBy(desc(noteVersions.versionNumber)),
    db
      .select({
        publishedNotes: sql<number>`count(*) filter (where ${notes.status} = 'published')::int`,
        totalSales: sql<number>`coalesce(sum(${notes.salesCount}), 0)::int`,
        ratingSum: sql<number>`coalesce(sum(${notes.ratingSum}), 0)::int`,
        reviewCount: sql<number>`coalesce(sum(${notes.reviewCount}), 0)::int`,
      })
      .from(notes)
      .where(and(eq(notes.sellerId, note.sellerId), isNull(notes.deletedAt))),
    note.courseId
      ? passedMarks([{ sellerId: note.sellerId, courseId: note.courseId }])
      : Promise.resolve(new Set<string>()),
    viewer
      ? db
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(and(eq(bookmarks.userId, viewer.id), eq(bookmarks.noteId, note.id)))
      : Promise.resolve([]),
  ]);

  const owned = viewer ? await viewerOwnsNote(viewer.id, note.id) : false;

  return {
    note,
    course: row.course
      ? { name: row.course.name, slug: row.course.slug, code: row.course.code }
      : null,
    faculty: row.faculty
      ? { name: row.faculty.name, shortName: row.faculty.shortName, slug: row.faculty.slug }
      : null,
    professor: row.professor
      ? { name: row.professor.name, title: row.professor.title, slug: row.professor.slug }
      : null,
    seller: {
      id: row.seller.id,
      name: row.seller.name,
      username: row.seller.username,
      image: row.seller.image,
      publishedNotes: sellerStats?.publishedNotes ?? 0,
      totalSales: sellerStats?.totalSales ?? 0,
      averageRating: averageRating(sellerStats?.ratingSum ?? 0, sellerStats?.reviewCount ?? 0),
    },
    gradeVerified: passed.size > 0,
    previews: previews.map((p) => ({
      pageNumber: p.pageNumber,
      url: publicUrl(p.imageKey),
      width: p.width,
      height: p.height,
      blurred: p.blurred,
    })),
    versions,
    lastUpdated: versions[0]?.publishedAt ?? note.publishedAt,
    viewer: { isOwner: viewer?.id === note.sellerId, bookmarked: bookmark.length > 0, owned },
  };
}

/** Whether the user has an active entitlement for the note. */
export async function viewerOwnsNote(userId: string, noteId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.noteId, noteId),
        isNull(entitlements.revokedAt),
      ),
    );
  return Boolean(row);
}

/** View counter for conversion stats (sellers don't count their own views). */
export async function recordNoteView(
  noteId: string,
  viewerId: string | null,
  sellerId: string,
): Promise<void> {
  if (viewerId === sellerId) return;
  // Raw SQL so counters don't bump updated_at (which means "content changed").
  await db.execute(sql`UPDATE notes SET view_count = view_count + 1 WHERE id = ${noteId}`);
}

/**
 * Listings must reflect publication, unlisting and price changes immediately (a stale list
 * could show an unlisted note or an old price), so marketplace writes expire the tag.
 */
export function invalidateNoteListings(): void {
  revalidateTag(NOTES_TAG, { expire: 0 });
}
