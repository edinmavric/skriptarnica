import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';

import { db } from '../db/client';
import {
  bookmarks,
  courseProfessors,
  courses,
  entitlements,
  examPeriods,
  faculties,
  notes,
  professors,
  programCourses,
  studentProfiles,
  userCourseStatus,
} from '../db/schema';

import { candidateCourses } from './recommendations';
import { publishedNotesBase, toNoteCards } from './note-pages';

/** Exam periods starting within `days` for the user's enrolled/candidate courses (SPEC §4.2). */
export async function upcomingExamPeriods(userId: string, days = 21) {
  const courseIds = [...(await candidateCourses(userId)).keys()];
  if (courseIds.length === 0) return [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(
    new Date(),
  );
  const until = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(
    new Date(Date.now() + days * 86_400_000),
  );
  const rows = await db
    .select({
      id: examPeriods.id,
      period: examPeriods.period,
      academicYear: examPeriods.academicYear,
      startsOn: examPeriods.startsOn,
      courseId: courses.id,
      courseName: courses.name,
      courseSlug: courses.slug,
      facultySlug: faculties.slug,
      noteCount: sql<number>`(select count(*)::int from ${notes} where ${notes.courseId} = ${courses.id} and ${notes.status} = 'published' and ${notes.deletedAt} is null)`,
    })
    .from(examPeriods)
    .innerJoin(courses, eq(courses.id, examPeriods.courseId))
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(
      and(
        inArray(examPeriods.courseId, courseIds),
        gte(examPeriods.startsOn, today),
        lte(examPeriods.startsOn, until),
      ),
    )
    .orderBy(asc(examPeriods.startsOn))
    .limit(6);
  return rows;
}

export async function feedCounters(userId: string) {
  const [[saved], [owned], [tracked]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(bookmarks)
      .where(eq(bookmarks.userId, userId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(entitlements)
      .where(and(eq(entitlements.userId, userId), isNull(entitlements.revokedAt))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(userCourseStatus)
      .where(eq(userCourseStatus.userId, userId)),
  ]);
  return { saved: saved?.n ?? 0, owned: owned?.n ?? 0, courses: tracked?.n ?? 0 };
}

export async function savedNotes(userId: string) {
  const rows = await publishedNotesBase()
    .innerJoin(bookmarks, eq(bookmarks.noteId, notes.id))
    .where(
      and(
        eq(bookmarks.userId, userId),
        inArray(notes.status, ['published', 'unlisted']),
        isNull(notes.deletedAt),
      ),
    )
    .orderBy(desc(bookmarks.createdAt));
  return toNoteCards(rows);
}

/** Courses for the "my courses" page: the program up to next year plus anything already marked. */
export async function myCourses(userId: string) {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  const statuses = await db
    .select()
    .from(userCourseStatus)
    .where(eq(userCourseStatus.userId, userId));
  const programRows =
    profile?.programId && profile.year
      ? await db
          .select({ courseId: programCourses.courseId, year: programCourses.year })
          .from(programCourses)
          .where(
            and(
              eq(programCourses.programId, profile.programId),
              lte(programCourses.year, profile.year + 1),
            ),
          )
      : [];
  const courseIds = [
    ...new Set([...programRows.map((r) => r.courseId), ...statuses.map((s) => s.courseId)]),
  ];
  if (courseIds.length === 0) return { courses: [], hasProgram: Boolean(profile?.programId) };
  const [courseRows, professorRows] = await Promise.all([
    db
      .select({ id: courses.id, name: courses.name, code: courses.code })
      .from(courses)
      .where(inArray(courses.id, courseIds))
      .orderBy(asc(courses.name)),
    db
      .select({
        courseId: courseProfessors.courseId,
        id: professors.id,
        name: professors.name,
        title: professors.title,
      })
      .from(courseProfessors)
      .innerJoin(professors, eq(professors.id, courseProfessors.professorId))
      .where(inArray(courseProfessors.courseId, courseIds)),
  ]);
  const yearByCourse = new Map(programRows.map((r) => [r.courseId, r.year]));
  return {
    hasProgram: Boolean(profile?.programId),
    courses: courseRows
      .map((course) => {
        const status = statuses.find((s) => s.courseId === course.id);
        return {
          ...course,
          year: yearByCourse.get(course.id) ?? null,
          status: status?.status ?? null,
          grade: status?.grade ?? null,
          professorId: status?.professorId ?? null,
          professors: professorRows
            .filter((p) => p.courseId === course.id)
            .map((p) => ({ id: p.id, name: p.title ? `${p.title} ${p.name}` : p.name })),
        };
      })
      .sort((a, b) => (a.year ?? 99) - (b.year ?? 99) || a.name.localeCompare(b.name, 'sr')),
  };
}

export async function setCourseProfessor(
  userId: string,
  courseId: string,
  professorId: string | null,
): Promise<boolean> {
  if (professorId) {
    const [link] = await db
      .select({ id: courseProfessors.id })
      .from(courseProfessors)
      .where(
        and(eq(courseProfessors.courseId, courseId), eq(courseProfessors.professorId, professorId)),
      );
    if (!link) return false;
  }
  const updated = await db
    .update(userCourseStatus)
    .set({ professorId })
    .where(and(eq(userCourseStatus.userId, userId), eq(userCourseStatus.courseId, courseId)))
    .returning({ id: userCourseStatus.id });
  return updated.length > 0;
}
