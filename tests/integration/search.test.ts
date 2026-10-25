import { describe, expect, it } from 'vitest';

import { db } from '@/server/db/client';
import {
  upsertCourse,
  upsertFaculty,
  upsertProfessor,
  upsertUniversity,
} from '@/server/services/catalog';
import { search } from '@/server/services/search';

import { uid } from './factories';

async function seedCacak() {
  const suffix = uid();
  const university = await upsertUniversity(db, {
    name: `Univerzitet u Kragujevcu ${suffix}`,
    shortName: 'UNIKG',
    city: 'Kragujevac',
    slug: `kg-${suffix}`,
  });
  const faculty = await upsertFaculty(db, {
    universityId: university.id,
    name: 'Fakultet tehničkih nauka u Čačku',
    shortName: 'FTN Čačak',
    city: 'Čačak',
    slug: `ftn-cacak-${suffix}`,
  });
  const course = await upsertCourse(db, {
    facultyId: faculty.id,
    name: `Osnovi elektrotehnike ${suffix}`,
    code: `OET${suffix}`,
  });
  const professor = await upsertProfessor(db, {
    facultyId: faculty.id,
    name: `Đorđe Ćirić ${suffix}`,
    title: 'prof. dr',
  });
  return { faculty, course, professor, suffix };
}

const ids = (response: Awaited<ReturnType<typeof search>>, type: string) =>
  response.groups.find((group) => group.type === type)?.results.map((result) => result.id) ?? [];

describe('search (SPEC §4.6 acceptance)', () => {
  it('"cacak", "Čačak" and "Чачак" return the same result', async () => {
    const { faculty } = await seedCacak();
    const [latin, diacritics, cyrillic] = await Promise.all([
      search('cacak'),
      search('Čačak'),
      search('Чачак'),
    ]);
    expect(ids(latin, 'faculty')).toContain(faculty.id);
    expect(ids(diacritics, 'faculty')).toEqual(ids(latin, 'faculty'));
    expect(ids(cyrillic, 'faculty')).toEqual(ids(latin, 'faculty'));
  });

  it('"dj" matches "đ" and Cyrillic names match Latin input', async () => {
    const { professor } = await seedCacak();
    expect(ids(await search('djordje ciric'), 'professor')).toContain(professor.id);
    expect(ids(await search('Ђорђе Ћирић'), 'professor')).toContain(professor.id);
    expect(ids(await search('Đorđe'), 'professor')).toContain(professor.id);
  });

  it('matches word prefixes and course codes', async () => {
    const { course, suffix } = await seedCacak();
    expect(ids(await search(`osn elektro ${suffix}`), 'course')).toContain(course.id);
    expect(ids(await search(`oet${suffix}`), 'course')).toContain(course.id);
  });

  it('tolerates a typo via trigram similarity', async () => {
    const { course, suffix } = await seedCacak();
    expect(ids(await search(`osnovi elektrotehnke ${suffix}`), 'course')).toContain(course.id);
  });

  it('returns nothing for empty or one-character queries, and survives tsquery syntax', async () => {
    expect((await search('')).groups).toEqual([]);
    expect((await search('a')).groups).toEqual([]);
    await expect(search("a' & | ! ( ) :* \\ %_")).resolves.toBeDefined();
  });
});
