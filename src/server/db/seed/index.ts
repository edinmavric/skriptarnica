import 'dotenv/config';

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { and, eq } from 'drizzle-orm';

import { env } from '@/env';
import { slugify } from '@/lib/slug';

import {
  linkCourseProfessor,
  linkProgramCourse,
  upsertCourse,
  upsertFaculty,
  upsertProfessor,
  upsertProgram,
  upsertUniversity,
} from '../../services/catalog';
import { db } from '../client';
import { courses, faculties, studyPrograms } from '../schema';

/**
 * Seeds. `catalog`: sample universities/faculties/programs (idempotent).
 * `demo`: illustrative courses/professors and demo content for dev/preview — never production.
 * Usage: npm run db:seed -- catalog|demo|all
 */

interface CatalogFile {
  universities: {
    name: string;
    shortName: string;
    city: string;
    slug: string;
    emailDomains: string[];
    faculties: {
      name: string;
      shortName: string;
      slug: string;
      city: string;
      emailDomains: string[];
      programs: {
        name: string;
        level: 'oas' | 'mas' | 'das' | 'oss';
        durationYears: number;
        slug: string;
      }[];
    }[];
  }[];
}

interface DemoFile {
  courses: {
    faculty: string;
    name: string;
    code: string | null;
    programs: [string, number, number][];
  }[];
  professors: { faculty: string; name: string; title: string; courses: string[] }[];
}

const here = path.dirname(new URL(import.meta.url).pathname);
const readJson = <T>(file: string): T =>
  JSON.parse(readFileSync(path.join(here, file), 'utf8')) as T;

async function seedCatalog() {
  const data = readJson<CatalogFile>('catalog.sample.json');
  await db.transaction(async (tx) => {
    for (const uni of data.universities) {
      const university = await upsertUniversity(tx, uni);
      for (const fac of uni.faculties) {
        const faculty = await upsertFaculty(tx, { ...fac, universityId: university.id });
        for (const program of fac.programs) {
          await upsertProgram(tx, { ...program, facultyId: faculty.id });
        }
      }
    }
  });
  console.log(`catalog: ${data.universities.length} universities seeded`);
}

async function seedDemoCatalog() {
  const data = readJson<DemoFile>('demo.json');
  await db.transaction(async (tx) => {
    for (const item of data.courses) {
      const [faculty] = await tx.select().from(faculties).where(eq(faculties.slug, item.faculty));
      if (!faculty) throw new Error(`demo: unknown faculty ${item.faculty}`);
      const course = await upsertCourse(tx, {
        facultyId: faculty.id,
        name: item.name,
        code: item.code,
      });
      for (const [programSlug, year, semester] of item.programs) {
        const [program] = await tx
          .select()
          .from(studyPrograms)
          .where(and(eq(studyPrograms.facultyId, faculty.id), eq(studyPrograms.slug, programSlug)));
        if (!program) throw new Error(`demo: unknown program ${programSlug}`);
        await linkProgramCourse(tx, { programId: program.id, courseId: course.id, year, semester });
      }
    }
    for (const item of data.professors) {
      const [faculty] = await tx.select().from(faculties).where(eq(faculties.slug, item.faculty));
      if (!faculty) throw new Error(`demo: unknown faculty ${item.faculty}`);
      const professor = await upsertProfessor(tx, {
        facultyId: faculty.id,
        name: item.name,
        title: item.title,
      });
      for (const courseName of item.courses) {
        const [course] = await tx
          .select()
          .from(courses)
          .where(and(eq(courses.facultyId, faculty.id), eq(courses.slug, slugify(courseName))));
        if (course) await linkCourseProfessor(tx, course.id, professor.id);
      }
    }
  });
  console.log(`demo: ${data.courses.length} courses, ${data.professors.length} professors`);
}

async function main() {
  const target = process.argv[2] ?? 'all';
  if (target === 'catalog' || target === 'all') await seedCatalog();
  if (target === 'demo' || target === 'all') {
    if (env.APP_ENV === 'production') {
      throw new Error('Refusing to seed demo content in production (APP_ENV=production).');
    }
    await seedDemoCatalog();
    const { seedDemoContent } = await import('./demo-content');
    await seedDemoContent();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
