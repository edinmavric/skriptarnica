import { relations, sql, type SQL } from 'drizzle-orm';
import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { id, timestamps, tsvector } from './_common';
import { users } from './auth';

/**
 * Search columns: `searchText` is written by the app with lib/search/normalize (lowercase,
 * Cyrillic→Latin, no diacritics). `searchTsv` is generated from it with the `simple` config.
 */
const searchColumns = () => ({
  searchText: text().notNull().default(''),
  searchTsv: tsvector().generatedAlwaysAs((): SQL => sql`to_tsvector('simple', search_text)`),
});

const searchIndexes = (table: string, t: { searchText: AnyPgColumn; searchTsv: AnyPgColumn }) => [
  index(`${table}_search_tsv_idx`).using('gin', t.searchTsv),
  index(`${table}_search_trgm_idx`).using('gin', sql`${t.searchText} gin_trgm_ops`),
];

export const universities = pgTable(
  'universities',
  {
    id: id(),
    name: text().notNull(),
    shortName: text().notNull(),
    city: text().notNull(),
    slug: text().notNull(),
    /** Student email domains, e.g. student.etf.bg.ac.rs (student verification). */
    emailDomains: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...searchColumns(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('universities_slug_uq').on(t.slug), ...searchIndexes('universities', t)],
);

export const faculties = pgTable(
  'faculties',
  {
    id: id(),
    universityId: uuid()
      .notNull()
      .references(() => universities.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    shortName: text().notNull(),
    slug: text().notNull(),
    city: text().notNull(),
    /** Faculty-specific student email domains (in addition to the university's). */
    emailDomains: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    ...searchColumns(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('faculties_slug_uq').on(t.slug),
    index('faculties_university_idx').on(t.universityId),
    ...searchIndexes('faculties', t),
  ],
);

export const programLevel = pgEnum('program_level', ['oas', 'mas', 'das', 'oss']);

export const studyPrograms = pgTable(
  'study_programs',
  {
    id: id(),
    facultyId: uuid()
      .notNull()
      .references(() => faculties.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    level: programLevel().notNull(),
    durationYears: smallint().notNull(),
    slug: text().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('study_programs_faculty_slug_uq').on(t.facultyId, t.slug),
    index('study_programs_faculty_idx').on(t.facultyId),
  ],
);

export const courses = pgTable(
  'courses',
  {
    id: id(),
    facultyId: uuid()
      .notNull()
      .references(() => faculties.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    code: text(),
    slug: text().notNull(),
    ects: smallint(),
    ...searchColumns(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('courses_faculty_slug_uq').on(t.facultyId, t.slug),
    index('courses_faculty_idx').on(t.facultyId),
    ...searchIndexes('courses', t),
  ],
);

export const programCourses = pgTable(
  'program_courses',
  {
    id: id(),
    programId: uuid()
      .notNull()
      .references(() => studyPrograms.id, { onDelete: 'cascade' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    year: smallint().notNull(),
    semester: smallint().notNull(),
    mandatory: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('program_courses_uq').on(t.programId, t.courseId),
    index('program_courses_course_idx').on(t.courseId),
    index('program_courses_program_year_idx').on(t.programId, t.year),
  ],
);

export const professors = pgTable(
  'professors',
  {
    id: id(),
    facultyId: uuid()
      .notNull()
      .references(() => faculties.id, { onDelete: 'restrict' }),
    /** Public information only: name, title, faculty (SPEC §3.1). */
    name: text().notNull(),
    title: text(),
    slug: text().notNull(),
    ...searchColumns(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('professors_faculty_slug_uq').on(t.facultyId, t.slug),
    index('professors_faculty_idx').on(t.facultyId),
    ...searchIndexes('professors', t),
  ],
);

export const courseProfessors = pgTable(
  'course_professors',
  {
    id: id(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    professorId: uuid()
      .notNull()
      .references(() => professors.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('course_professors_uq').on(t.courseId, t.professorId),
    index('course_professors_professor_idx').on(t.professorId),
  ],
);

export const catalogRequestType = pgEnum('catalog_request_type', [
  'university',
  'faculty',
  'program',
  'course',
  'professor',
]);
export const catalogRequestStatus = pgEnum('catalog_request_status', [
  'pending',
  'approved',
  'rejected',
]);

export interface CatalogRequestPayload {
  name: string;
  shortName?: string;
  city?: string;
  universityId?: string;
  facultyId?: string;
  programId?: string;
  level?: 'oas' | 'mas' | 'das' | 'oss';
  durationYears?: number;
  year?: number;
  semester?: number;
  code?: string;
  title?: string;
}

export const catalogRequests = pgTable(
  'catalog_requests',
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: 'set null' }),
    type: catalogRequestType().notNull(),
    payload: jsonb().$type<CatalogRequestPayload>().notNull(),
    note: text(),
    status: catalogRequestStatus().notNull().default('pending'),
    reviewedById: uuid().references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
    reviewedAt: timestamp({ withTimezone: true }),
    rejectionReason: text(),
    createdEntityId: uuid(),
    ...timestamps(),
  },
  (t) => [
    index('catalog_requests_status_idx').on(t.status, t.createdAt),
    index('catalog_requests_user_idx').on(t.userId),
  ],
);

export const universitiesRelations = relations(universities, ({ many }) => ({
  faculties: many(faculties),
}));
export const facultiesRelations = relations(faculties, ({ one, many }) => ({
  university: one(universities, {
    fields: [faculties.universityId],
    references: [universities.id],
  }),
  programs: many(studyPrograms),
  courses: many(courses),
  professors: many(professors),
}));
export const studyProgramsRelations = relations(studyPrograms, ({ one, many }) => ({
  faculty: one(faculties, { fields: [studyPrograms.facultyId], references: [faculties.id] }),
  programCourses: many(programCourses),
}));
export const coursesRelations = relations(courses, ({ one, many }) => ({
  faculty: one(faculties, { fields: [courses.facultyId], references: [faculties.id] }),
  programCourses: many(programCourses),
  courseProfessors: many(courseProfessors),
}));
export const programCoursesRelations = relations(programCourses, ({ one }) => ({
  program: one(studyPrograms, {
    fields: [programCourses.programId],
    references: [studyPrograms.id],
  }),
  course: one(courses, { fields: [programCourses.courseId], references: [courses.id] }),
}));
export const professorsRelations = relations(professors, ({ one, many }) => ({
  faculty: one(faculties, { fields: [professors.facultyId], references: [faculties.id] }),
  courseProfessors: many(courseProfessors),
}));
export const courseProfessorsRelations = relations(courseProfessors, ({ one }) => ({
  course: one(courses, { fields: [courseProfessors.courseId], references: [courses.id] }),
  professor: one(professors, {
    fields: [courseProfessors.professorId],
    references: [professors.id],
  }),
}));
