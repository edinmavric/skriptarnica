import { and, eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

import { db } from '@/server/db/client';
import { communities, communityMembers } from '@/server/db/schema';
import { searchPrograms } from '@/server/services/catalog-pages';
import { upsertProgram } from '@/server/services/catalog';
import {
  joinSuggestedCommunities,
  saveCourseStatuses,
  saveProgramStep,
  suggestedCommunities,
} from '@/server/services/onboarding';

import { asCurrentUser, createCatalog, createUser, getProfile } from './factories';

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

describe('catalog communities', () => {
  it('gives every university and every program (smer) its own community', async () => {
    const catalog = await createCatalog();
    const rows = await db
      .select({ type: communities.type, name: communities.name })
      .from(communities)
      .where(
        and(
          eq(communities.universityId, catalog.university.id),
          eq(communities.type, 'university'),
        ),
      );
    expect(rows).toEqual([{ type: 'university', name: catalog.university.name }]);
    const [program] = await db
      .select({ name: communities.name, facultyId: communities.facultyId })
      .from(communities)
      .where(eq(communities.programId, catalog.program.id));
    expect(program).toEqual({
      name: `${catalog.program.name} (${catalog.faculty.shortName})`,
      facultyId: catalog.faculty.id,
    });
  });
});

describe('program search', () => {
  it('finds a program by any mix of program, faculty and university words', async () => {
    const catalog = await createCatalog();
    const byProgram = await searchPrograms(`smer ${catalog.suffix}`);
    expect(byProgram.map((row) => row.programId)).toContain(catalog.program.id);
    const byFacultyShortName = await searchPrograms(
      `${catalog.faculty.shortName.toLowerCase()} smer`,
      200,
    );
    expect(byFacultyShortName.map((row) => row.programId)).toContain(catalog.program.id);
    const match = byProgram.find((row) => row.programId === catalog.program.id);
    expect(match).toMatchObject({
      facultyId: catalog.faculty.id,
      universityId: catalog.university.id,
      universityName: catalog.university.name,
    });
    expect(await searchPrograms('nepostojeci smer xyz')).toEqual([]);
  });

  it('matches inflected Serbian words on their stem', async () => {
    const catalog = await createCatalog();
    const program = await upsertProgram(db, {
      facultyId: catalog.faculty.id,
      name: `Informaciono inženjerstvo ${catalog.suffix}`,
      level: 'oas',
      durationYears: 4,
    });
    const found = await searchPrograms(`informatika ${catalog.suffix}`);
    expect(found.map((row) => row.programId)).toContain(program.id);
  });
});

describe('onboarding: community suggestions', () => {
  it('suggests university, faculty, program and enrolled-course communities, and joins the chosen ones', async () => {
    const user = await createUser();
    const catalog = await createCatalog();
    await saveProgramStep(user.id, {
      universityId: catalog.university.id,
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 1,
    });
    const [math, physics] = catalog.courses;
    await saveCourseStatuses(user.id, { enrolled: [math.id], passed: [] }, true);
    expect((await getProfile(user.id))?.onboardingStep).toBe('communities');

    const suggestions = await suggestedCommunities(user.id);
    expect(suggestions.map((s) => s.type)).toEqual(['university', 'faculty', 'program', 'course']);
    expect(suggestions.find((s) => s.type === 'course')?.name).toContain(math.name);
    expect(suggestions.some((s) => s.name.includes(physics.name))).toBe(false);
    expect(suggestions.every((s) => !s.joined)).toBe(true);

    const chosen = suggestions.filter((s) => s.type !== 'course').map((s) => s.id);
    const result = await joinSuggestedCommunities(asCurrentUser(user), [
      ...chosen,
      '00000000-0000-7000-8000-000000000000',
    ]);
    expect(result).toEqual({ ok: true, value: { joined: 3 } });
    const memberships = await db
      .select({ communityId: communityMembers.communityId })
      .from(communityMembers)
      .where(eq(communityMembers.userId, user.id));
    expect(memberships.map((m) => m.communityId).sort()).toEqual([...chosen].sort());
    expect((await getProfile(user.id))?.onboardingStep).toBe('verify');
    const after = await suggestedCommunities(user.id);
    expect(
      after
        .filter((s) => s.joined)
        .map((s) => s.id)
        .sort(),
    ).toEqual([...chosen].sort());
  });

  it('falls back to this year’s program courses when none are marked as enrolled', async () => {
    const user = await createUser();
    const catalog = await createCatalog();
    await saveProgramStep(user.id, {
      universityId: catalog.university.id,
      facultyId: catalog.faculty.id,
      programId: catalog.program.id,
      year: 1,
    });
    const courseNames = (await suggestedCommunities(user.id))
      .filter((s) => s.type === 'course')
      .map((s) => s.name);
    expect(courseNames).toHaveLength(2);
    expect(courseNames.some((name) => name.includes(catalog.courses[2].name))).toBe(false);
  });
});
