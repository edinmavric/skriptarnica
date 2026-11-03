import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '@/server/db/client';
import { catalogRequests, programCourses, userCourseStatus } from '@/server/db/schema';
import {
  approveCatalogRequest,
  approveCourseRequestWithExisting,
} from '@/server/services/admin/catalog-admin';
import { upsertCourse } from '@/server/services/catalog';
import {
  absoluteSemester,
  myCourseProposals,
  proposeCourse,
  similarFacultyCourses,
} from '@/server/services/course-proposals';
import { saveProgramStep } from '@/server/services/onboarding';

import { createCatalog, createUser } from './factories';

vi.mock('@/server/jobs/client', () => ({
  trySendEvent: vi.fn(),
  sendEvent: vi.fn(),
  events: {},
  inngest: {},
}));
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  unstable_cache: <T>(fn: T) => fn,
}));

async function studentOnProgram() {
  const catalog = await createCatalog();
  const user = await createUser();
  await saveProgramStep(user.id, {
    universityId: catalog.university.id,
    facultyId: catalog.faculty.id,
    programId: catalog.program.id,
    year: 2,
  });
  return { catalog, user };
}

async function requestRow(id: string) {
  const [row] = await db.select().from(catalogRequests).where(eq(catalogRequests.id, id));
  if (!row) throw new Error('request missing');
  return row;
}

describe('course proposals', () => {
  it('maps a study year and term to the absolute semester', () => {
    expect(absoluteSemester(1, 'winter')).toBe(1);
    expect(absoluteSemester(2, 'summer')).toBe(4);
    expect(absoluteSemester(4, 'winter')).toBe(7);
  });

  it('records the program, year and semester, and lists it for the student', async () => {
    const { catalog, user } = await studentOnProgram();
    const result = await proposeCourse(user.id, {
      name: 'Verovatnoća i statistika',
      code: 'VIS',
      year: 2,
      term: 'summer',
    });
    if (!result.ok) throw new Error(result.error.messageKey);
    const row = await requestRow(result.value.id);
    expect(row).toMatchObject({ type: 'course', status: 'pending', userId: user.id });
    expect(row.payload).toMatchObject({
      name: 'Verovatnoća i statistika',
      code: 'VIS',
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 2,
      semester: 4,
    });
    const mine = await myCourseProposals(user.id);
    expect(mine[0]).toMatchObject({ name: 'Verovatnoća i statistika', status: 'pending' });
  });

  it('refuses without a program, beyond the program length, duplicates and existing courses', async () => {
    const lonely = await createUser();
    const noProgram = await proposeCourse(lonely.id, { name: 'Nešto', year: 1, term: 'winter' });
    expect(noProgram.ok || noProgram.error.messageKey).toBe('errors.courseProposal.noProgram');

    const { catalog, user } = await studentOnProgram();
    const tooLate = await proposeCourse(user.id, { name: 'Nešto', year: 5, term: 'winter' });
    expect(tooLate.ok || tooLate.error.fieldErrors).toEqual({
      year: ['validation.yearBeyondProgram'],
    });

    // Already on the program (diacritics and case don't matter).
    const existing = await proposeCourse(user.id, {
      name: catalog.courses[0].name.toUpperCase(),
      year: 1,
      term: 'winter',
    });
    expect(existing.ok || existing.error.messageKey).toBe('errors.courseProposal.exists');

    const first = await proposeCourse(user.id, { name: 'Baze podataka', year: 2, term: 'winter' });
    expect(first.ok).toBe(true);
    const again = await proposeCourse(user.id, { name: 'baze  podataka', year: 2, term: 'winter' });
    expect(again.ok || again.error.messageKey).toBe('errors.courseProposal.alreadyProposed');
  });

  it('on approval creates the course, places it on the program and enrolls the proposer', async () => {
    const { catalog, user } = await studentOnProgram();
    const admin = await createUser({ role: 'admin' });
    const proposal = await proposeCourse(user.id, {
      name: `Operativni sistemi ${catalog.suffix}`,
      year: 2,
      term: 'winter',
    });
    if (!proposal.ok) throw new Error(proposal.error.messageKey);
    const approved = await approveCatalogRequest(
      admin.id,
      proposal.value.id,
      'course',
      { facultyId: catalog.faculty.id, name: `Operativni sistemi ${catalog.suffix}`, code: null },
      'ip',
    );
    if (!approved.ok) throw new Error(approved.error.messageKey);
    const [placement] = await db
      .select({ year: programCourses.year, semester: programCourses.semester })
      .from(programCourses)
      .where(
        and(
          eq(programCourses.programId, catalog.program.id),
          eq(programCourses.courseId, approved.value.id),
        ),
      );
    expect(placement).toEqual({ year: 2, semester: 3 });
    const [status] = await db
      .select({ status: userCourseStatus.status })
      .from(userCourseStatus)
      .where(
        and(eq(userCourseStatus.userId, user.id), eq(userCourseStatus.courseId, approved.value.id)),
      );
    expect(status?.status).toBe('enrolled');
    expect((await requestRow(proposal.value.id)).status).toBe('approved');
  });

  it('can be approved by linking a similar course that already exists on the faculty', async () => {
    const { catalog, user } = await studentOnProgram();
    const admin = await createUser({ role: 'admin' });
    const elective = await upsertCourse(db, {
      facultyId: catalog.faculty.id,
      name: `Računarska grafika ${catalog.suffix}`,
    });
    const proposal = await proposeCourse(user.id, {
      name: `Racunarska grafika ${catalog.suffix}`,
      year: 2,
      term: 'summer',
    });
    if (!proposal.ok) throw new Error(proposal.error.messageKey);
    const similar = await similarFacultyCourses(
      catalog.faculty.id,
      `Racunarska grafika ${catalog.suffix}`,
    );
    expect(similar.map((course) => course.id)).toContain(elective.id);

    const linked = await approveCourseRequestWithExisting(
      admin.id,
      proposal.value.id,
      elective.id,
      'ip',
    );
    expect(linked.ok).toBe(true);
    const [placement] = await db
      .select({ semester: programCourses.semester })
      .from(programCourses)
      .where(
        and(
          eq(programCourses.programId, catalog.program.id),
          eq(programCourses.courseId, elective.id),
        ),
      );
    expect(placement?.semester).toBe(4);
    // Decided requests can't be decided again.
    const twice = await approveCourseRequestWithExisting(
      admin.id,
      proposal.value.id,
      elective.id,
      'ip',
    );
    expect(twice.ok || twice.error.messageKey).toBe('errors.admin.requestDecided');
  });
});
