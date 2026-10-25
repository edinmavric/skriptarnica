import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { routes } from '@/config/routes';
import { pageMetadata } from '@/lib/seo/metadata';
import { getCoursePage } from '@/server/services/catalog-pages';
import { communityForCourse } from '@/server/services/communities';

import { CourseNotes } from './course-notes';

type Props = {
  params: Promise<{ faculty: string; course: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { faculty, course } = await params;
  const data = await getCoursePage(faculty, course);
  if (!data) return {};
  const t = await getTranslations('catalog.course');
  return pageMetadata({
    image: null,
    title: `${data.course.name} (${data.faculty.shortName})`,
    description: t('metaDescription', { course: data.course.name, faculty: data.faculty.name }),
    path: routes.course(data.faculty.slug, data.course.slug),
  });
}

export default async function CoursePage({ params, searchParams }: Props) {
  const { faculty, course } = await params;
  const data = await getCoursePage(faculty, course);
  if (!data) notFound();
  const t = await getTranslations('catalog.course');
  const community = await communityForCourse(data.course.id);
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: t('home'), href: routes.home },
          { label: data.faculty.shortName, href: routes.faculty(data.faculty.slug) },
          { label: data.course.name, href: routes.course(data.faculty.slug, data.course.slug) },
        ]}
      />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-display font-bold">{data.course.name}</h1>
        {data.course.code ? (
          <span className="font-mono text-ink-muted">{data.course.code}</span>
        ) : null}
      </div>
      <p className="mt-1 text-ink-muted">{data.faculty.name}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {data.programs.map((program) => (
          <Badge key={program.name} tone="outline">
            {t('programYear', {
              program: program.name,
              year: program.year,
              semester: program.semester,
            })}
          </Badge>
        ))}
      </div>
      {data.professors.length > 0 ? (
        <p className="mt-3 text-sm">
          <span className="text-ink-muted">{t('professors')}: </span>
          {data.professors.map((professor, index) => (
            <span key={professor.id}>
              {index > 0 ? ', ' : ''}
              <Link
                href={routes.professor(data.faculty.slug, professor.slug)}
                className="text-pen underline underline-offset-2"
              >
                {professor.title ? `${professor.title} ` : ''}
                {professor.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}
      {community ? (
        <p className="mt-4">
          <Link
            href={routes.community(community.slug)}
            className="inline-flex min-h-11 items-center rounded-md border border-field px-3 text-sm hover:border-ink"
          >
            {t('community', { name: community.name })}
          </Link>
        </p>
      ) : null}
      <CourseNotes
        courseId={data.course.id}
        facultySlug={data.faculty.slug}
        courseSlug={data.course.slug}
        professors={data.professors}
        searchParams={await searchParams}
      />
    </div>
  );
}
