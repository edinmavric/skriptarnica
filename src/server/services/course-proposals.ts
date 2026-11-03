import { and, desc, eq, sql } from 'drizzle-orm';

import { normalizeForSearch } from '@/lib/search/normalize';
import { appError, err, ok, type Result } from '@/lib/result';
import type { CourseProposalInput } from '@/lib/validation/onboarding';

import { db } from '../db/client';
import {
  catalogRequests,
  courses,
  faculties,
  programCourses,
  studentProfiles,
  studyPrograms,
  userCourseStatus,
} from '../db/schema';
import type { DbOrTx } from '../db/types';

/** At most this many undecided proposals per student, so the admin queue stays reviewable. */
const MAX_PENDING_PROPOSALS = 10;

/** Absolute semester (1–12) from a study year and term. */
export function absoluteSemester(year: number, term: 'winter' | 'summer'): number {
  return (year - 1) * 2 + (term === 'winter' ? 1 : 2);
}

/** The student's program, which a proposed course is added to. */
export async function proposalContext(userId: string) {
  const [row] = await db
    .select({
      programId: studyPrograms.id,
      programName: studyPrograms.name,
      durationYears: studyPrograms.durationYears,
      facultyId: faculties.id,
      facultyShortName: faculties.shortName,
      universityId: faculties.universityId,
      year: studentProfiles.year,
    })
    .from(studentProfiles)
    .innerJoin(studyPrograms, eq(studyPrograms.id, studentProfiles.programId))
    .innerJoin(faculties, eq(faculties.id, studyPrograms.facultyId))
    .where(eq(studentProfiles.userId, userId));
  return row ?? null;
}
export type ProposalContext = NonNullable<Awaited<ReturnType<typeof proposalContext>>>;

/**
 * A student proposes a course missing from their program. It becomes a catalog request of type
 * "course" with the program, year and semester; an admin approves it (creating the course or
 * linking an existing one) or rejects it.
 */
export async function proposeCourse(
  userId: string,
  input: CourseProposalInput,
): Promise<Result<{ id: string }>> {
  const context = await proposalContext(userId);
  if (!context) return err(appError('VALIDATION', 'errors.courseProposal.noProgram'));
  if (input.year > context.durationYears)
    return err(
      appError('VALIDATION', 'errors.validation', { year: ['validation.yearBeyondProgram'] }),
    );
  const wanted = normalizeForSearch(input.name);
  const [onProgram, mine] = await Promise.all([
    db
      .select({ name: courses.name })
      .from(programCourses)
      .innerJoin(courses, eq(courses.id, programCourses.courseId))
      .where(eq(programCourses.programId, context.programId)),
    db
      .select({ payload: catalogRequests.payload })
      .from(catalogRequests)
      .where(
        and(
          eq(catalogRequests.userId, userId),
          eq(catalogRequests.type, 'course'),
          eq(catalogRequests.status, 'pending'),
        ),
      ),
  ]);
  if (onProgram.some((course) => normalizeForSearch(course.name) === wanted))
    return err(appError('CONFLICT', 'errors.courseProposal.exists'));
  if (
    mine.some(
      (request) =>
        request.payload.programId === context.programId &&
        normalizeForSearch(request.payload.name) === wanted,
    )
  )
    return err(appError('CONFLICT', 'errors.courseProposal.alreadyProposed'));
  if (mine.length >= MAX_PENDING_PROPOSALS)
    return err(appError('RATE_LIMITED', 'errors.courseProposal.tooMany'));

  const [row] = await db
    .insert(catalogRequests)
    .values({
      userId,
      type: 'course',
      note: input.note || null,
      payload: {
        name: input.name,
        ...(input.code ? { code: input.code } : {}),
        universityId: context.universityId,
        facultyId: context.facultyId,
        programId: context.programId,
        year: input.year,
        semester: absoluteSemester(input.year, input.term),
      },
    })
    .returning({ id: catalogRequests.id });
  if (!row) throw new Error('course proposal insert failed');
  return ok({ id: row.id });
}

/** The student's recent course proposals with their outcome, newest first. */
export async function myCourseProposals(userId: string) {
  const rows = await db
    .select({
      id: catalogRequests.id,
      payload: catalogRequests.payload,
      status: catalogRequests.status,
      rejectionReason: catalogRequests.rejectionReason,
      createdAt: catalogRequests.createdAt,
    })
    .from(catalogRequests)
    .where(and(eq(catalogRequests.userId, userId), eq(catalogRequests.type, 'course')))
    .orderBy(desc(catalogRequests.createdAt))
    .limit(20);
  return rows.map((row) => ({
    id: row.id,
    name: row.payload.name,
    year: row.payload.year ?? null,
    status: row.status,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt,
  }));
}

/**
 * After approval: put the course on the proposed program at the proposed year/semester and add it
 * to the proposer's courses ("Slušam") so they see it right away.
 */
export async function placeApprovedCourse(
  tx: DbOrTx,
  request: {
    userId: string | null;
    payload: { programId?: string; year?: number; semester?: number };
  },
  courseId: string,
): Promise<void> {
  const { programId, year, semester } = request.payload;
  if (!programId || !year || !semester) return;
  await tx
    .insert(programCourses)
    .values({ programId, courseId, year, semester, mandatory: true })
    .onConflictDoNothing();
  if (request.userId)
    await tx
      .insert(userCourseStatus)
      .values({ userId: request.userId, courseId, status: 'enrolled' })
      .onConflictDoNothing();
}

/**
 * Existing courses on the faculty that look like the proposed one, so the admin can link one
 * instead of creating a duplicate (trigram similarity on the normalized name).
 */
export async function similarFacultyCourses(facultyId: string, name: string, limit = 3) {
  const normalized = normalizeForSearch(name);
  return db
    .select({ id: courses.id, name: courses.name, code: courses.code })
    .from(courses)
    .where(
      and(
        eq(courses.facultyId, facultyId),
        sql`similarity(${courses.searchText}, ${normalized}) > 0.35`,
      ),
    )
    .orderBy(sql`similarity(${courses.searchText}, ${normalized}) desc`)
    .limit(limit);
}
