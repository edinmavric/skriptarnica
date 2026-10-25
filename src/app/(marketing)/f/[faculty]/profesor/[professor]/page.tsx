import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { routes } from '@/config/routes';
import { pageMetadata } from '@/lib/seo/metadata';
import { getProfessorPage } from '@/server/services/catalog-pages';

type Props = { params: Promise<{ faculty: string; professor: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { faculty, professor } = await params;
  const data = await getProfessorPage(faculty, professor);
  if (!data) return {};
  const t = await getTranslations('catalog.professor');
  const name = data.professor.title
    ? `${data.professor.title} ${data.professor.name}`
    : data.professor.name;
  return pageMetadata({
    title: `${name} (${data.faculty.shortName})`,
    description: t('metaDescription', { name, faculty: data.faculty.name }),
    path: routes.professor(data.faculty.slug, data.professor.slug),
  });
}

export default async function ProfessorPage({ params }: Props) {
  const { faculty, professor } = await params;
  const data = await getProfessorPage(faculty, professor);
  if (!data) notFound();
  const t = await getTranslations('catalog.professor');
  const name = data.professor.title
    ? `${data.professor.title} ${data.professor.name}`
    : data.professor.name;
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: t('home'), href: routes.home },
          { label: data.faculty.shortName, href: routes.faculty(data.faculty.slug) },
          {
            label: data.professor.name,
            href: routes.professor(data.faculty.slug, data.professor.slug),
          },
        ]}
      />
      <h1 className="text-display font-bold">{name}</h1>
      <p className="mt-1 text-ink-muted">{data.faculty.name}</p>
      <p className="mt-4 max-w-prose text-sm text-ink-muted">{t('publicInfoNote')}</p>
      <h2 className="mt-8 mb-3 text-display-sm font-semibold">{t('courses')}</h2>
      {data.courses.length === 0 ? (
        <p className="text-ink-muted">{t('noCourses')}</p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {data.courses.map((course) => (
            <li key={course.id}>
              <Link
                href={routes.course(data.faculty.slug, course.slug)}
                className="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-paper-sunk"
              >
                <span>{course.name}</span>
                {course.code ? (
                  <span className="font-mono text-sm text-ink-muted">{course.code}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
