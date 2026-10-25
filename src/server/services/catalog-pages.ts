import { and, asc, eq, sql } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { db } from '../db/client';
import {
  courseProfessors,
  courses,
  faculties,
  notes,
  professors,
  programCourses,
  studyPrograms,
  universities,
} from '../db/schema';

/**
 * Read models for public catalog pages, cached with tags (SPEC §8.2). Pages are rendered per
 * request (nonce CSP); the data is served from the cache and invalidated by `revalidateTag`.
 */
export const CATALOG_TAG = 'catalog';

export const getUniversityPage = unstable_cache(
  async (slug: string) => {
    const [university] = await db.select().from(universities).where(eq(universities.slug, slug));
    if (!university) return null;
    const facultyRows = await db
      .select({
        id: faculties.id,
        name: faculties.name,
        shortName: faculties.shortName,
        city: faculties.city,
        slug: faculties.slug,
      })
      .from(faculties)
      .where(eq(faculties.universityId, university.id))
      .orderBy(asc(faculties.name));
    return { university, faculties: facultyRows };
  },
  ['university-page'],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

export const getFacultyPage = unstable_cache(
  async (slug: string) => {
    const [row] = await db
      .select({ faculty: faculties, university: universities })
      .from(faculties)
      .innerJoin(universities, eq(universities.id, faculties.universityId))
      .where(eq(faculties.slug, slug));
    if (!row) return null;
    const [programs, programCourseRows, courseRows, professorRows] = await Promise.all([
      db
        .select()
        .from(studyPrograms)
        .where(eq(studyPrograms.facultyId, row.faculty.id))
        .orderBy(asc(studyPrograms.name)),
      db
        .select({
          programId: programCourses.programId,
          courseId: programCourses.courseId,
          year: programCourses.year,
          semester: programCourses.semester,
        })
        .from(programCourses)
        .innerJoin(courses, eq(courses.id, programCourses.courseId))
        .where(eq(courses.facultyId, row.faculty.id)),
      db
        .select({ id: courses.id, name: courses.name, code: courses.code, slug: courses.slug })
        .from(courses)
        .where(eq(courses.facultyId, row.faculty.id))
        .orderBy(asc(courses.name)),
      db
        .select({
          id: professors.id,
          name: professors.name,
          title: professors.title,
          slug: professors.slug,
        })
        .from(professors)
        .where(eq(professors.facultyId, row.faculty.id))
        .orderBy(asc(professors.name)),
    ]);
    const courseById = new Map(courseRows.map((course) => [course.id, course]));
    return {
      faculty: row.faculty,
      university: row.university,
      programs: programs.map((program) => {
        const links = programCourseRows.filter((link) => link.programId === program.id);
        const years = [...new Set(links.map((link) => link.year))].sort((a, b) => a - b);
        return {
          ...program,
          years: years.map((year) => ({
            year,
            courses: links
              .filter((link) => link.year === year)
              .sort((a, b) => a.semester - b.semester)
              .flatMap((link) => {
                const course = courseById.get(link.courseId);
                return course ? [{ ...course, semester: link.semester }] : [];
              }),
          })),
        };
      }),
      courses: courseRows,
      professors: professorRows,
    };
  },
  ['faculty-page'],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

/** Published notes per course of a faculty. Not cached: it changes with every publish. */
export async function noteCountsForFaculty(facultyId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ courseId: notes.courseId, count: sql<number>`count(*)::int` })
    .from(notes)
    .innerJoin(courses, eq(courses.id, notes.courseId))
    .where(and(eq(courses.facultyId, facultyId), eq(notes.status, 'published')))
    .groupBy(notes.courseId);
  return new Map(rows.flatMap((row) => (row.courseId ? [[row.courseId, row.count] as const] : [])));
}

export const getCoursePage = unstable_cache(
  async (facultySlug: string, courseSlug: string) => {
    const [row] = await db
      .select({ course: courses, faculty: faculties, university: universities })
      .from(courses)
      .innerJoin(faculties, eq(faculties.id, courses.facultyId))
      .innerJoin(universities, eq(universities.id, faculties.universityId))
      .where(and(eq(faculties.slug, facultySlug), eq(courses.slug, courseSlug)));
    if (!row) return null;
    const [programRows, professorRows] = await Promise.all([
      db
        .select({
          name: studyPrograms.name,
          year: programCourses.year,
          semester: programCourses.semester,
          mandatory: programCourses.mandatory,
        })
        .from(programCourses)
        .innerJoin(studyPrograms, eq(studyPrograms.id, programCourses.programId))
        .where(eq(programCourses.courseId, row.course.id))
        .orderBy(asc(studyPrograms.name)),
      db
        .select({
          id: professors.id,
          name: professors.name,
          title: professors.title,
          slug: professors.slug,
        })
        .from(courseProfessors)
        .innerJoin(professors, eq(professors.id, courseProfessors.professorId))
        .where(eq(courseProfessors.courseId, row.course.id))
        .orderBy(asc(professors.name)),
    ]);
    return { ...row, programs: programRows, professors: professorRows };
  },
  ['course-page'],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

export const getProfessorPage = unstable_cache(
  async (facultySlug: string, professorSlug: string) => {
    const [row] = await db
      .select({ professor: professors, faculty: faculties })
      .from(professors)
      .innerJoin(faculties, eq(faculties.id, professors.facultyId))
      .where(and(eq(faculties.slug, facultySlug), eq(professors.slug, professorSlug)));
    if (!row) return null;
    const courseRows = await db
      .select({ id: courses.id, name: courses.name, code: courses.code, slug: courses.slug })
      .from(courseProfessors)
      .innerJoin(courses, eq(courses.id, courseProfessors.courseId))
      .where(eq(courseProfessors.professorId, row.professor.id))
      .orderBy(asc(courses.name));
    return { ...row, courses: courseRows };
  },
  ['professor-page'],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

export const listFacultiesForPicker = unstable_cache(
  async () =>
    db
      .select({
        slug: faculties.slug,
        name: faculties.name,
        shortName: faculties.shortName,
        city: faculties.city,
      })
      .from(faculties)
      .orderBy(asc(faculties.name)),
  ['faculty-picker'],
  { tags: [CATALOG_TAG], revalidate: 3600 },
);

/** All catalog URLs for the sitemap. */
export async function listCatalogSitemapEntries() {
  const [unis, facs, courseRows, professorRows] = await Promise.all([
    db.select({ slug: universities.slug, updatedAt: universities.updatedAt }).from(universities),
    db.select({ slug: faculties.slug, updatedAt: faculties.updatedAt }).from(faculties),
    db
      .select({ slug: courses.slug, facultySlug: faculties.slug, updatedAt: courses.updatedAt })
      .from(courses)
      .innerJoin(faculties, eq(faculties.id, courses.facultyId)),
    db
      .select({
        slug: professors.slug,
        facultySlug: faculties.slug,
        updatedAt: professors.updatedAt,
      })
      .from(professors)
      .innerJoin(faculties, eq(faculties.id, professors.facultyId)),
  ]);
  return { universities: unis, faculties: facs, courses: courseRows, professors: professorRows };
}

export async function countCatalog() {
  const [row] = await db.select({ courses: sql<number>`count(*)::int` }).from(courses);
  return row?.courses ?? 0;
}
