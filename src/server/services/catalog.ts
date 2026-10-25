import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';

import { normalizeForSearch } from '@/lib/search/normalize';
import { slugify } from '@/lib/slug';

import { db } from '../db/client';
import {
  courseProfessors,
  courses,
  faculties,
  programCourses,
  professors,
  studyPrograms,
  universities,
} from '../db/schema';
import type { DbOrTx } from '../db/types';

/**
 * Academic catalog (SPEC §3.1). Create functions are idempotent upserts by slug, used by the
 * seed, the admin panel and catalog request approval.
 */

export interface UniversityInput {
  name: string;
  shortName: string;
  city: string;
  slug?: string;
  emailDomains?: string[];
}

export async function upsertUniversity(tx: DbOrTx, input: UniversityInput) {
  const slug = input.slug ?? slugify(input.name);
  const values = {
    name: input.name,
    shortName: input.shortName,
    city: input.city,
    slug,
    emailDomains: (input.emailDomains ?? []).map((domain) => domain.toLowerCase()),
    searchText: normalizeForSearch(`${input.name} ${input.shortName} ${input.city}`),
  };
  const [row] = await tx
    .insert(universities)
    .values(values)
    .onConflictDoUpdate({ target: universities.slug, set: values })
    .returning();
  if (!row) throw new Error('university upsert failed');
  return row;
}

export interface FacultyInput {
  universityId: string;
  name: string;
  shortName: string;
  city: string;
  slug?: string;
  emailDomains?: string[];
}

export async function upsertFaculty(tx: DbOrTx, input: FacultyInput) {
  const slug = input.slug ?? slugify(`${input.shortName} ${input.city}`);
  const values = {
    universityId: input.universityId,
    name: input.name,
    shortName: input.shortName,
    city: input.city,
    slug,
    emailDomains: (input.emailDomains ?? []).map((domain) => domain.toLowerCase()),
    searchText: normalizeForSearch(`${input.name} ${input.shortName} ${input.city}`),
  };
  const [row] = await tx
    .insert(faculties)
    .values(values)
    .onConflictDoUpdate({ target: faculties.slug, set: values })
    .returning();
  if (!row) throw new Error('faculty upsert failed');
  // Every faculty gets its community automatically (SPEC §4.7).
  const { ensureFacultyCommunity } = await import('./communities');
  await ensureFacultyCommunity(tx, row);
  return row;
}

export interface ProgramInput {
  facultyId: string;
  name: string;
  level: 'oas' | 'mas' | 'das' | 'oss';
  durationYears: number;
  slug?: string;
}

export async function upsertProgram(tx: DbOrTx, input: ProgramInput) {
  const values = { ...input, slug: input.slug ?? slugify(input.name) };
  const [row] = await tx
    .insert(studyPrograms)
    .values(values)
    .onConflictDoUpdate({ target: [studyPrograms.facultyId, studyPrograms.slug], set: values })
    .returning();
  if (!row) throw new Error('program upsert failed');
  return row;
}

export interface CourseInput {
  facultyId: string;
  name: string;
  code?: string | null;
  ects?: number | null;
  slug?: string;
}

export async function upsertCourse(tx: DbOrTx, input: CourseInput) {
  const values = {
    facultyId: input.facultyId,
    name: input.name,
    code: input.code ?? null,
    ects: input.ects ?? null,
    slug: input.slug ?? slugify(input.name),
    searchText: normalizeForSearch(`${input.name} ${input.code ?? ''}`),
  };
  const [row] = await tx
    .insert(courses)
    .values(values)
    .onConflictDoUpdate({ target: [courses.facultyId, courses.slug], set: values })
    .returning();
  if (!row) throw new Error('course upsert failed');
  // Every course gets its community automatically (SPEC §4.7).
  const [faculty] = await tx.select().from(faculties).where(eq(faculties.id, row.facultyId));
  if (faculty) {
    const { ensureCourseCommunity } = await import('./communities');
    await ensureCourseCommunity(tx, row, faculty);
  }
  return row;
}

export async function linkProgramCourse(
  tx: DbOrTx,
  input: {
    programId: string;
    courseId: string;
    year: number;
    semester: number;
    mandatory?: boolean;
  },
) {
  await tx
    .insert(programCourses)
    .values({ ...input, mandatory: input.mandatory ?? true })
    .onConflictDoUpdate({
      target: [programCourses.programId, programCourses.courseId],
      set: { year: input.year, semester: input.semester, mandatory: input.mandatory ?? true },
    });
}

export interface ProfessorInput {
  facultyId: string;
  name: string;
  title?: string | null;
  slug?: string;
}

export async function upsertProfessor(tx: DbOrTx, input: ProfessorInput) {
  const values = {
    facultyId: input.facultyId,
    name: input.name,
    title: input.title ?? null,
    slug: input.slug ?? slugify(input.name),
    searchText: normalizeForSearch(input.name),
  };
  const [row] = await tx
    .insert(professors)
    .values(values)
    .onConflictDoUpdate({ target: [professors.facultyId, professors.slug], set: values })
    .returning();
  if (!row) throw new Error('professor upsert failed');
  return row;
}

export async function linkCourseProfessor(tx: DbOrTx, courseId: string, professorId: string) {
  await tx.insert(courseProfessors).values({ courseId, professorId }).onConflictDoNothing();
}

// --- Queries ---------------------------------------------------------------------------

/** Universities with their faculties, for onboarding comboboxes (small, cacheable). */
export async function listUniversitiesWithFaculties() {
  const [unis, facs] = await Promise.all([
    db.select().from(universities).orderBy(asc(universities.name)),
    db.select().from(faculties).orderBy(asc(faculties.name)),
  ]);
  return unis.map((university) => ({
    id: university.id,
    name: university.name,
    shortName: university.shortName,
    city: university.city,
    faculties: facs
      .filter((faculty) => faculty.universityId === university.id)
      .map((faculty) => ({
        id: faculty.id,
        name: faculty.name,
        shortName: faculty.shortName,
        city: faculty.city,
        slug: faculty.slug,
      })),
  }));
}

export async function listProgramsForFaculty(facultyId: string) {
  return db
    .select({
      id: studyPrograms.id,
      name: studyPrograms.name,
      level: studyPrograms.level,
      durationYears: studyPrograms.durationYears,
    })
    .from(studyPrograms)
    .where(eq(studyPrograms.facultyId, facultyId))
    .orderBy(asc(studyPrograms.name));
}

/** Courses of a program up to and including `year`, grouped by year for onboarding. */
export async function listProgramCoursesUpToYear(programId: string, year: number) {
  return db
    .select({
      id: courses.id,
      name: courses.name,
      code: courses.code,
      year: programCourses.year,
      semester: programCourses.semester,
      mandatory: programCourses.mandatory,
    })
    .from(programCourses)
    .innerJoin(courses, eq(courses.id, programCourses.courseId))
    .where(and(eq(programCourses.programId, programId), lte(programCourses.year, year)))
    .orderBy(asc(programCourses.year), asc(programCourses.semester), asc(courses.name));
}

export async function coursesExistForFaculty(
  courseIds: string[],
  facultyId: string,
): Promise<boolean> {
  if (courseIds.length === 0) return true;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(courses)
    .where(and(inArray(courses.id, courseIds), eq(courses.facultyId, facultyId)));
  return (row?.count ?? 0) === courseIds.length;
}

export async function listCourseProfessors(courseId: string) {
  return db
    .select({ id: professors.id, name: professors.name, title: professors.title })
    .from(courseProfessors)
    .innerJoin(professors, eq(professors.id, courseProfessors.professorId))
    .where(eq(courseProfessors.courseId, courseId))
    .orderBy(asc(professors.name));
}

export async function getCourseLabel(courseId: string) {
  const [row] = await db
    .select({
      id: courses.id,
      name: courses.name,
      code: courses.code,
      facultyShortName: faculties.shortName,
    })
    .from(courses)
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(eq(courses.id, courseId));
  return row ?? null;
}
