import { and, eq, isNull } from 'drizzle-orm';
import { getTranslations } from 'next-intl/server';

import { formatPrice } from '@/lib/format';
import { db } from '@/server/db/client';
import { courses, faculties, notes } from '@/server/db/schema';
import { OG_SIZE, renderOg } from '@/server/seo/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Skripta';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTranslations('og');
  const [note] = await db
    .select({
      title: notes.title,
      price: notes.pricePara,
      pages: notes.pageCount,
      course: courses.name,
      faculty: faculties.shortName,
    })
    .from(notes)
    .leftJoin(courses, eq(courses.id, notes.courseId))
    .leftJoin(faculties, eq(faculties.id, courses.facultyId))
    .where(and(eq(notes.slug, slug), eq(notes.status, 'published'), isNull(notes.deletedAt)));
  if (!note) return renderOg({ kicker: t('defaultKicker'), title: t('defaultTitle') });
  return renderOg({
    kicker: [note.course, note.faculty].filter(Boolean).join(' · ') || t('note'),
    title: note.title,
    details: note.pages ? t('pages', { count: note.pages }) : null,
    badge: note.price === 0 ? t('free') : formatPrice(note.price),
  });
}
