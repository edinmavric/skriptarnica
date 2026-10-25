import { and, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm';

import { RECOMMENDATION_CACHE_SECONDS, RECOMMENDATION_LIMIT } from '@/config/recommendations';
import { rankRecommendations, type Candidate, type CandidateReason } from '@/lib/recommendations';

import { db } from '../db/client';
import {
  entitlements,
  notes,
  noteVersions,
  orderItems,
  orders,
  programCourses,
  studentProfiles,
  userCourseStatus,
} from '../db/schema';
import { logger } from '../logger';
import { redis } from '../redis';

import { publishedNotesBase, toNoteCards } from './note-pages';
import { recommendationsKey } from './recommendations-cache';

/**
 * Candidate courses for a user (SPEC §4.5): enrolled courses first, then the program's courses
 * for the current year, then next year's. Passed courses are not candidates.
 */
export async function candidateCourses(userId: string): Promise<Map<string, CandidateReason>> {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  const statuses = await db
    .select()
    .from(userCourseStatus)
    .where(eq(userCourseStatus.userId, userId));
  const passed = new Set(statuses.filter((s) => s.status === 'passed').map((s) => s.courseId));
  const reasons = new Map<string, CandidateReason>();
  for (const status of statuses)
    if (status.status === 'enrolled') reasons.set(status.courseId, 'enrolled');
  if (profile?.programId && profile.year) {
    const rows = await db
      .select({ courseId: programCourses.courseId, year: programCourses.year })
      .from(programCourses)
      .where(
        and(
          eq(programCourses.programId, profile.programId),
          inArray(programCourses.year, [profile.year, profile.year + 1]),
        ),
      );
    for (const row of rows) {
      if (passed.has(row.courseId) || reasons.has(row.courseId)) continue;
      reasons.set(row.courseId, row.year === profile.year ? 'currentYear' : 'nextYear');
    }
  }
  return reasons;
}

async function computeRanking(userId: string): Promise<{ noteId: string; score: number }[]> {
  const reasons = await candidateCourses(userId);
  if (reasons.size === 0) return [];
  const courseIds = [...reasons.keys()];
  const professorByCourse = new Map(
    (
      await db
        .select({ courseId: userCourseStatus.courseId, professorId: userCourseStatus.professorId })
        .from(userCourseStatus)
        .where(eq(userCourseStatus.userId, userId))
    ).map((row) => [row.courseId, row.professorId]),
  );
  const since = new Date(Date.now() - 30 * 86_400_000);
  const sales30d = db
    .select({ noteId: orderItems.noteId, n: sql<number>`count(*)::int`.as('n') })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(eq(orders.status, 'paid'), gte(orders.paidAt, since)))
    .groupBy(orderItems.noteId)
    .as('sales30d');
  const rows = await db
    .select({
      id: notes.id,
      sellerId: notes.sellerId,
      courseId: notes.courseId,
      professorId: notes.professorId,
      ratingSum: notes.ratingSum,
      reviewCount: notes.reviewCount,
      publishedAt: notes.publishedAt,
      versionPublishedAt: noteVersions.publishedAt,
      sales: sql<number>`coalesce(${sales30d.n}, 0)`,
    })
    .from(notes)
    .leftJoin(noteVersions, eq(noteVersions.id, notes.currentVersionId))
    .leftJoin(sales30d, eq(sales30d.noteId, notes.id))
    .where(
      and(
        inArray(notes.courseId, courseIds),
        eq(notes.status, 'published'),
        isNull(notes.deletedAt),
        ne(notes.sellerId, userId),
      ),
    )
    .limit(500);
  const owned = new Set(
    (
      await db
        .select({ noteId: entitlements.noteId })
        .from(entitlements)
        .where(and(eq(entitlements.userId, userId), isNull(entitlements.revokedAt)))
    ).map((row) => row.noteId),
  );
  const candidates: Candidate[] = rows.map((row) => ({
    noteId: row.id,
    sellerId: row.sellerId,
    reason: reasons.get(row.courseId as string) as CandidateReason,
    ratingSum: row.ratingSum,
    reviewCount: row.reviewCount,
    sales30d: Number(row.sales),
    updatedAt: row.versionPublishedAt ?? row.publishedAt ?? new Date(0),
    sameProfessor: Boolean(
      row.professorId && professorByCourse.get(row.courseId as string) === row.professorId,
    ),
    owned: owned.has(row.id),
  }));
  return rankRecommendations(candidates, new Date(), RECOMMENDATION_LIMIT).map((item) => ({
    noteId: item.noteId,
    score: item.score,
  }));
}

/** Ranking cached per user in Redis for 15 minutes; invalidated when the user's courses change. */
export async function getRecommendedNoteIds(userId: string): Promise<string[]> {
  const key = recommendationsKey(userId);
  try {
    const cached = await redis.get<string[]>(key);
    if (cached) return cached;
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      'recommendation cache read failed',
    );
  }
  const ids = (await computeRanking(userId)).map((item) => item.noteId);
  try {
    await redis.set(key, ids, { ex: RECOMMENDATION_CACHE_SECONDS });
  } catch {
    // The cache is an optimization.
  }
  return ids;
}

/** Note cards in recommendation order. Notes that became unavailable since caching drop out. */
export async function getRecommendations(userId: string) {
  const ids = await getRecommendedNoteIds(userId);
  if (ids.length === 0) return [];
  const rows = await publishedNotesBase().where(
    and(inArray(notes.id, ids), eq(notes.status, 'published'), isNull(notes.deletedAt)),
  );
  const order = new Map(ids.map((id, index) => [id, index]));
  const cards = await toNoteCards(rows);
  return cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export { computeRanking as _computeRankingForTests };
