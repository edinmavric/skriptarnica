import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { slugify } from '@/lib/slug';
import { db } from '@/server/db/client';
import { studentProfiles, users } from '@/server/db/schema';
import {
  linkProgramCourse,
  upsertCourse,
  upsertFaculty,
  upsertProgram,
  upsertUniversity,
} from '@/server/services/catalog';
import type { CurrentUser } from '@/server/auth/session';

/** Test data builders. Every call uses unique slugs/emails so tests never collide. */
export function uid(): string {
  return randomUUID().slice(0, 8);
}

export async function createUser(
  overrides: Partial<{
    emailVerified: boolean;
    role: 'student' | 'admin';
    twoFactorEnabled: boolean;
    name: string;
  }> = {},
) {
  const suffix = uid();
  const [user] = await db
    .insert(users)
    .values({
      name: overrides.name ?? `Test ${suffix}`,
      email: `user.${suffix}@example.com`,
      emailVerified: overrides.emailVerified ?? true,
      username: `user_${suffix}`,
      role: overrides.role ?? 'student',
      twoFactorEnabled: overrides.twoFactorEnabled ?? false,
    })
    .returning();
  if (!user) throw new Error('createUser failed');
  await db.insert(studentProfiles).values({ userId: user.id }).onConflictDoNothing();
  return user;
}

export function asCurrentUser(
  user: Awaited<ReturnType<typeof createUser>>,
  overrides: Partial<CurrentUser> = {},
): CurrentUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    username: user.username,
    image: user.image,
    role: user.role,
    twoFactorEnabled: user.twoFactorEnabled,
    bannedAt: user.bannedAt,
    sessionId: randomUUID(),
    impersonatedBy: null,
    ...overrides,
  };
}

export async function createCatalog(options: { emailDomains?: string[] } = {}) {
  const suffix = uid();
  const university = await upsertUniversity(db, {
    name: `Univerzitet ${suffix}`,
    shortName: `U${suffix}`,
    city: 'Beograd',
    slug: `uni-${suffix}`,
    emailDomains: options.emailDomains ?? [`student.${suffix}.ac.rs`],
  });
  const faculty = await upsertFaculty(db, {
    universityId: university.id,
    name: `Fakultet ${suffix}`,
    shortName: `F${suffix}`,
    city: 'Beograd',
    slug: `fak-${suffix}`,
  });
  const program = await upsertProgram(db, {
    facultyId: faculty.id,
    name: `Smer ${suffix}`,
    level: 'oas',
    durationYears: 4,
  });
  const courseA = await upsertCourse(db, { facultyId: faculty.id, name: `Matematika ${suffix}` });
  const courseB = await upsertCourse(db, { facultyId: faculty.id, name: `Fizika ${suffix}` });
  const courseC = await upsertCourse(db, {
    facultyId: faculty.id,
    name: `Programiranje ${suffix}`,
  });
  await linkProgramCourse(db, {
    programId: program.id,
    courseId: courseA.id,
    year: 1,
    semester: 1,
  });
  await linkProgramCourse(db, {
    programId: program.id,
    courseId: courseB.id,
    year: 1,
    semester: 2,
  });
  await linkProgramCourse(db, {
    programId: program.id,
    courseId: courseC.id,
    year: 2,
    semester: 1,
  });
  return { university, faculty, program, courses: [courseA, courseB, courseC] as const, suffix };
}

export async function getProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, userId));
  return profile;
}

export { slugify };
