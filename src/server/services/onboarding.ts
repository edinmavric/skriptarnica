import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, inArray, isNull } from 'drizzle-orm';

import { routes } from '@/config/routes';
import { env } from '@/env';
import { appError, err, ok, type Result } from '@/lib/result';

import { db } from '../db/client';
import {
  catalogRequests,
  courses,
  faculties,
  programCourses,
  studentEmailVerifications,
  studentProfiles,
  studyPrograms,
  universities,
  userCourseStatus,
  users,
} from '../db/schema';
import { sendActionEmail } from '../email/send';
import type { CatalogRequestInput, CoursesStepInput } from '@/lib/validation/onboarding';

export type OnboardingStep = 'username' | 'program' | 'courses' | 'verify' | 'done';

async function ensureProfile(userId: string) {
  await db.insert(studentProfiles).values({ userId }).onConflictDoNothing();
}

export async function setUsername(userId: string, username: string): Promise<Result<void>> {
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
  if (taken && taken.id !== userId) {
    return err(
      appError('CONFLICT', 'errors.usernameTaken', { username: ['validation.usernameTaken'] }),
    );
  }
  await db.update(users).set({ username, displayUsername: username }).where(eq(users.id, userId));
  return ok(undefined);
}

export async function saveProgramStep(
  userId: string,
  input: { universityId: string; facultyId: string; programId: string; year: number },
): Promise<Result<void>> {
  const [row] = await db
    .select({
      facultyUniversity: faculties.universityId,
      programFaculty: studyPrograms.facultyId,
      duration: studyPrograms.durationYears,
    })
    .from(studyPrograms)
    .innerJoin(faculties, eq(faculties.id, studyPrograms.facultyId))
    .where(eq(studyPrograms.id, input.programId));
  if (
    !row ||
    row.programFaculty !== input.facultyId ||
    row.facultyUniversity !== input.universityId
  ) {
    return err(
      appError('VALIDATION', 'errors.validation', { programId: ['validation.programMismatch'] }),
    );
  }
  if (input.year > row.duration) {
    return err(appError('VALIDATION', 'errors.validation', { year: ['validation.yearTooHigh'] }));
  }
  await ensureProfile(userId);
  await db
    .update(studentProfiles)
    .set({ ...input, onboardingStep: 'courses' })
    .where(eq(studentProfiles.userId, userId));
  return ok(undefined);
}

/**
 * Saves enrolled/passed marks for courses of the user's faculty. Courses of the user's
 * program that were unmarked are cleared; marks on other courses are left alone.
 */
export async function saveCourseStatuses(
  userId: string,
  input: CoursesStepInput,
  advanceStep: boolean,
): Promise<Result<void>> {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  if (!profile?.facultyId || !profile.programId) {
    return err(appError('VALIDATION', 'errors.onboardingProgramFirst'));
  }
  const passedIds = input.passed.map((entry) => entry.courseId);
  const allIds = [...new Set([...input.enrolled, ...passedIds])];
  if (input.enrolled.some((courseId) => passedIds.includes(courseId))) {
    return err(appError('VALIDATION', 'errors.courseBothStates'));
  }
  if (allIds.length > 0) {
    const valid = await db
      .select({ id: courses.id })
      .from(courses)
      .where(and(inArray(courses.id, allIds), eq(courses.facultyId, profile.facultyId)));
    if (valid.length !== allIds.length) return err(appError('VALIDATION', 'errors.validation'));
  }
  const programCourseIds = (
    await db
      .select({ courseId: programCourses.courseId })
      .from(programCourses)
      .where(eq(programCourses.programId, profile.programId))
  ).map((row) => row.courseId);
  const toClear = programCourseIds.filter((courseId) => !allIds.includes(courseId));

  await db.transaction(async (tx) => {
    if (toClear.length > 0) {
      await tx
        .delete(userCourseStatus)
        .where(
          and(eq(userCourseStatus.userId, userId), inArray(userCourseStatus.courseId, toClear)),
        );
    }
    for (const courseId of input.enrolled) {
      await tx
        .insert(userCourseStatus)
        .values({ userId, courseId, status: 'enrolled', grade: null })
        .onConflictDoUpdate({
          target: [userCourseStatus.userId, userCourseStatus.courseId],
          set: { status: 'enrolled', grade: null },
        });
    }
    for (const { courseId, grade } of input.passed) {
      await tx
        .insert(userCourseStatus)
        .values({ userId, courseId, status: 'passed', grade })
        .onConflictDoUpdate({
          target: [userCourseStatus.userId, userCourseStatus.courseId],
          set: { status: 'passed', grade },
        });
    }
    if (advanceStep) {
      await tx
        .update(studentProfiles)
        .set({ onboardingStep: 'verify' })
        .where(eq(studentProfiles.userId, userId));
    }
  });
  return ok(undefined);
}

export async function completeOnboarding(userId: string): Promise<void> {
  await ensureProfile(userId);
  await db
    .update(studentProfiles)
    .set({ onboardingStep: 'done', onboardingCompletedAt: new Date() })
    .where(eq(studentProfiles.userId, userId));
}

export async function skipToStep(userId: string, step: OnboardingStep): Promise<void> {
  await ensureProfile(userId);
  await db
    .update(studentProfiles)
    .set({ onboardingStep: step })
    .where(eq(studentProfiles.userId, userId));
}

/** True when `email`'s domain equals or is a subdomain of an allowed domain. */
export function emailMatchesDomains(email: string, domains: string[]): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function requestStudentEmailVerification(
  userId: string,
  email: string,
): Promise<Result<void>> {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  if (!profile?.universityId) return err(appError('VALIDATION', 'errors.onboardingProgramFirst'));
  const [university] = await db
    .select()
    .from(universities)
    .where(eq(universities.id, profile.universityId));
  const [faculty] = profile.facultyId
    ? await db.select().from(faculties).where(eq(faculties.id, profile.facultyId))
    : [];
  if (!university) return err(appError('NOT_FOUND', 'errors.validation'));
  const domains = [...university.emailDomains, ...(faculty?.emailDomains ?? [])];
  if (!emailMatchesDomains(email, domains)) {
    return err(
      appError('VALIDATION', 'errors.validation', { email: ['validation.studentEmailDomain'] }),
    );
  }
  const token = randomBytes(32).toString('base64url');
  await db.insert(studentEmailVerifications).values({
    userId,
    email,
    universityId: university.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const url = `${env.NEXT_PUBLIC_APP_URL}${routes.verifyStudentEmail}?token=${token}`;
  await sendActionEmail('studentEmail', email, url, { university: university.name });
  return ok(undefined);
}

export async function confirmStudentEmail(userId: string, token: string): Promise<Result<void>> {
  const [row] = await db
    .select()
    .from(studentEmailVerifications)
    .where(
      and(
        eq(studentEmailVerifications.tokenHash, hashToken(token)),
        eq(studentEmailVerifications.userId, userId),
        isNull(studentEmailVerifications.usedAt),
        gt(studentEmailVerifications.expiresAt, new Date()),
      ),
    );
  if (!row) return err(appError('VALIDATION', 'errors.studentTokenInvalid'));
  await db.transaction(async (tx) => {
    await tx
      .update(studentEmailVerifications)
      .set({ usedAt: new Date() })
      .where(eq(studentEmailVerifications.id, row.id));
    await tx
      .update(studentProfiles)
      .set({ studentVerifiedAt: new Date(), studentEmail: row.email })
      .where(eq(studentProfiles.userId, userId));
  });
  return ok(undefined);
}

export async function createCatalogRequest(
  userId: string,
  input: CatalogRequestInput,
): Promise<Result<{ id: string }>> {
  const { type, name, note, ...rest } = input;
  const [row] = await db
    .insert(catalogRequests)
    .values({
      userId,
      type,
      note: note ?? null,
      payload: {
        name,
        ...(rest.universityId ? { universityId: rest.universityId } : {}),
        ...(rest.facultyId ? { facultyId: rest.facultyId } : {}),
        ...(rest.programId ? { programId: rest.programId } : {}),
        ...(rest.city ? { city: rest.city } : {}),
      },
    })
    .returning({ id: catalogRequests.id });
  if (!row) throw new Error('catalog request insert failed');
  return ok({ id: row.id });
}
