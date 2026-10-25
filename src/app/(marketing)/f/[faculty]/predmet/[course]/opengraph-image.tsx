import { and, count, eq } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { db } from '@/server/db/client';
import { courses, faculties, notes } from '@/server/db/schema';
import { OG_SIZE, renderOg } from '@/server/seo/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Predmet';

export default async function Image({
  params,
}: {
  params: Promise<{ faculty: string; course: string }>;
}) {
  const { faculty: facultySlug, course: courseSlug } = await params;
  const t = await getTranslations('og');
  const [row] = await db
    .select({ id: courses.id, name: courses.name, faculty: faculties.name })
    .from(courses)
    .innerJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(and(eq(faculties.slug, facultySlug), eq(courses.slug, courseSlug)));
  if (!row) return renderOg({ kicker: t('defaultKicker'), title: t('defaultTitle') });
  const [published] = await db
    .select({ value: count() })
    .from(notes)
    .where(and(eq(notes.courseId, row.id), eq(notes.status, 'published')));
  return renderOg({
    kicker: row.faculty,
    title: row.name,
    details: t('courseNotes', { count: published?.value ?? 0 }),
  });
}
