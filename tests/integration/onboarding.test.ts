import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '@/server/db/client';
import { catalogRequests, userCourseStatus } from '@/server/db/schema';
import {
  createCatalogRequest,
  emailMatchesDomains,
  requestStudentEmailVerification,
  saveCourseStatuses,
  saveProgramStep,
} from '@/server/services/onboarding';
import { readDevOutbox } from '@/server/email/transport';

import { createCatalog, createUser, getProfile } from './factories';

vi.mock('@/server/services/recommendations-cache', () => ({ invalidateRecommendations: vi.fn() }));

describe('onboarding: program step', () => {
  it('saves a consistent university/faculty/program/year and advances', async () => {
    const user = await createUser();
    const catalog = await createCatalog();
    const result = await saveProgramStep(user.id, {
      universityId: catalog.university.id,
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 2,
    });
    expect(result.ok).toBe(true);
    const profile = await getProfile(user.id);
    expect(profile?.programId).toBe(catalog.program.id);
    expect(profile?.year).toBe(2);
    expect(profile?.onboardingStep).toBe('courses');
  });

  it('rejects a program from another faculty', async () => {
    const user = await createUser();
    const a = await createCatalog();
    const b = await createCatalog();
    const result = await saveProgramStep(user.id, {
      universityId: a.university.id,
      facultyId: a.faculty.id,
      programId: b.program.id,
      year: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.fieldErrors?.programId).toEqual(['validation.programMismatch']);
  });

  it('rejects a year beyond the program duration', async () => {
    const user = await createUser();
    const catalog = await createCatalog();
    const result = await saveProgramStep(user.id, {
      universityId: catalog.university.id,
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 5,
    });
    expect(result.ok).toBe(false);
  });
});

describe('onboarding: course statuses', () => {
  async function onboarded() {
    const user = await createUser();
    const catalog = await createCatalog();
    await saveProgramStep(user.id, {
      universityId: catalog.university.id,
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 2,
    });
    return { user, catalog };
  }

  it('stores enrolled and passed (with grade) and clears unmarked program courses', async () => {
    const { user, catalog } = await onboarded();
    const [a, b, c] = catalog.courses;
    expect(
      (
        await saveCourseStatuses(
          user.id,
          {
            enrolled: [c.id],
            passed: [
              { courseId: a.id, grade: 9 },
              { courseId: b.id, grade: null },
            ],
          },
          true,
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await saveCourseStatuses(
          user.id,
          { enrolled: [c.id], passed: [{ courseId: a.id, grade: 10 }] },
          false,
        )
      ).ok,
    ).toBe(true);
    const rows = await db
      .select()
      .from(userCourseStatus)
      .where(eq(userCourseStatus.userId, user.id));
    const byCourse = Object.fromEntries(rows.map((row) => [row.courseId, row]));
    expect(byCourse[a.id]).toMatchObject({ status: 'passed', grade: 10 });
    expect(byCourse[b.id]).toBeUndefined();
    expect(byCourse[c.id]).toMatchObject({ status: 'enrolled', grade: null });
    expect((await getProfile(user.id))?.onboardingStep).toBe('verify');
  });

  it('refuses courses from another faculty (no cross-faculty writes)', async () => {
    const { user } = await onboarded();
    const other = await createCatalog();
    const result = await saveCourseStatuses(
      user.id,
      { enrolled: [other.courses[0].id], passed: [] },
      true,
    );
    expect(result.ok).toBe(false);
    const rows = await db
      .select()
      .from(userCourseStatus)
      .where(
        and(
          eq(userCourseStatus.userId, user.id),
          eq(userCourseStatus.courseId, other.courses[0].id),
        ),
      );
    expect(rows).toHaveLength(0);
  });

  it('refuses a course marked both enrolled and passed', async () => {
    const { user, catalog } = await onboarded();
    const result = await saveCourseStatuses(
      user.id,
      {
        enrolled: [catalog.courses[0].id],
        passed: [{ courseId: catalog.courses[0].id, grade: 8 }],
      },
      true,
    );
    expect(result.ok).toBe(false);
  });
});

describe('student email verification', () => {
  it('matches exact domains and subdomains only', () => {
    expect(emailMatchesDomains('pera@student.etf.bg.ac.rs', ['student.etf.bg.ac.rs'])).toBe(true);
    expect(emailMatchesDomains('pera@student.etf.bg.ac.rs', ['bg.ac.rs'])).toBe(true);
    expect(emailMatchesDomains('pera@evilbg.ac.rs', ['bg.ac.rs'])).toBe(false);
    expect(emailMatchesDomains('pera@gmail.com', ['bg.ac.rs'])).toBe(false);
  });

  it('sends a link only for a matching domain', async () => {
    const user = await createUser();
    const catalog = await createCatalog({ emailDomains: ['student.test-uni.ac.rs'] });
    await saveProgramStep(user.id, {
      universityId: catalog.university.id,
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 1,
    });
    expect((await requestStudentEmailVerification(user.id, 'x@gmail.com')).ok).toBe(false);
    const address = `pera.${catalog.suffix}@student.test-uni.ac.rs`;
    expect((await requestStudentEmailVerification(user.id, address)).ok).toBe(true);
    const outbox = await readDevOutbox(address);
    expect(outbox[0]?.category).toBe('studentEmail');
  });
});

describe('catalog requests', () => {
  it('stores a pending request with payload', async () => {
    const user = await createUser();
    const result = await createCatalogRequest(user.id, {
      type: 'program',
      name: 'Biomedicinsko inženjerstvo',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db
      .select()
      .from(catalogRequests)
      .where(eq(catalogRequests.id, result.value.id));
    expect(row).toMatchObject({
      status: 'pending',
      type: 'program',
      payload: { name: 'Biomedicinsko inženjerstvo' },
    });
  });
});
