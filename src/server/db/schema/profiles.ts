import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { citext, id, timestamps } from './_common';
import { users } from './auth';
import { courses, faculties, professors, studyPrograms, universities } from './catalog';

export const studentProfiles = pgTable(
  'student_profiles',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    universityId: uuid().references(() => universities.id, { onDelete: 'set null' }),
    facultyId: uuid().references(() => faculties.id, { onDelete: 'set null' }),
    programId: uuid().references(() => studyPrograms.id, { onDelete: 'set null' }),
    year: smallint(),
    /** Verified via a faculty/university email domain (SPEC §4.1). */
    studentVerifiedAt: timestamp({ withTimezone: true }),
    studentEmail: citext(),
    bio: text(),
    /** 18+ self-confirmation, required for selling (SPEC §4.1.5). */
    isAdult: boolean().notNull().default(false),
    /** Onboarding progress (resumable): 'program' → 'courses' → 'verify' → done. */
    onboardingStep: text().notNull().default('program'),
    onboardingCompletedAt: timestamp({ withTimezone: true }),
    // Privacy: what the public profile shows (SPEC §4.8).
    showFaculty: boolean().notNull().default(true),
    showProgram: boolean().notNull().default(true),
    /** Non-anonymous posts and comments on the public profile. */
    showActivity: boolean().notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('student_profiles_user_uq').on(t.userId),
    index('student_profiles_faculty_idx').on(t.facultyId),
    index('student_profiles_program_idx').on(t.programId),
  ],
);

export const courseStatus = pgEnum('course_status', ['enrolled', 'passed']);

export const userCourseStatus = pgTable(
  'user_course_status',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    status: courseStatus().notNull(),
    grade: smallint(),
    /** e.g. "januarski 2026" */
    examPeriod: text(),
    /** The user's professor for this course (recommendation signal, SPEC §4.5). */
    professorId: uuid().references(() => professors.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('user_course_status_uq').on(t.userId, t.courseId),
    index('user_course_status_course_idx').on(t.courseId, t.status),
  ],
);

export const consentType = pgEnum('consent_type', [
  'terms',
  'privacy',
  'marketing_email',
  'analytics_cookies',
  'seller_terms',
  'age_15',
  'age_18',
]);

/** Consent history: append-only, never overwritten (SPEC §3.2). The latest row per type wins. */
export const consents = pgTable(
  'consents',
  {
    id: id(),
    userId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    /** Anonymous visitors' cookie choices are keyed by a random device id. */
    anonymousId: text(),
    type: consentType().notNull(),
    documentVersion: text().notNull(),
    value: boolean().notNull(),
    ipHash: text(),
    ...timestamps(),
  },
  (t) => [
    index('consents_user_type_idx').on(t.userId, t.type, t.createdAt),
    index('consents_anon_idx').on(t.anonymousId),
  ],
);

export const studentEmailVerifications = pgTable(
  'student_email_verifications',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: citext().notNull(),
    universityId: uuid()
      .notNull()
      .references(() => universities.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('student_email_verifications_token_uq').on(t.tokenHash),
    index('student_email_verifications_user_idx').on(t.userId),
  ],
);

export const studentProfilesRelations = relations(studentProfiles, ({ one }) => ({
  user: one(users, { fields: [studentProfiles.userId], references: [users.id] }),
  university: one(universities, {
    fields: [studentProfiles.universityId],
    references: [universities.id],
  }),
  faculty: one(faculties, { fields: [studentProfiles.facultyId], references: [faculties.id] }),
  program: one(studyPrograms, {
    fields: [studentProfiles.programId],
    references: [studyPrograms.id],
  }),
}));

export const userCourseStatusRelations = relations(userCourseStatus, ({ one }) => ({
  user: one(users, { fields: [userCourseStatus.userId], references: [users.id] }),
  course: one(courses, { fields: [userCourseStatus.courseId], references: [courses.id] }),
}));
