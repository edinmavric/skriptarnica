import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { EmptyState } from '@/components/ui/empty-state';
import { routes } from '@/config/routes';
import { pageMetadata } from '@/lib/seo/metadata';
import { getFacultyPage } from '@/server/services/catalog-pages';
import { communityForFaculty } from '@/server/services/communities';

type Props = { params: Promise<{ faculty: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getFacultyPage((await params).faculty);
  if (!data) return {};
  const t = await getTranslations('catalog.faculty');
  return pageMetadata({
    title: `${data.faculty.name} (${data.faculty.shortName})`,
    description: t('metaDescription', { name: data.faculty.name, city: data.faculty.city }),
    path: routes.faculty(data.faculty.slug),
  });
}

export default async function FacultyPage({ params }: Props) {
  const data = await getFacultyPage((await params).faculty);
  if (!data) notFound();
  const t = await getTranslations('catalog.faculty');
  const { faculty, university } = data;
  const community = await communityForFaculty(faculty.id);
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: t('home'), href: routes.home },
          { label: university.name, href: routes.university(university.slug) },
          { label: faculty.shortName, href: routes.faculty(faculty.slug) },
        ]}
      />
      <h1 className="text-display font-bold">{faculty.name}</h1>
      <p className="mt-1 text-ink-muted">
        {university.name}, {faculty.city}
      </p>
      {community ? (
        <p className="mt-3">
          <Link
            href={routes.community(community.slug)}
            className="inline-flex min-h-11 items-center rounded-md border border-field px-3 text-sm hover:border-ink"
          >
            {t('community', { name: `z/${community.slug}` })}
          </Link>
        </p>
      ) : null}
      {community ? (
        <p className="mt-3">
          <Link
            href={routes.community(community.slug)}
            className="inline-flex min-h-11 items-center rounded-md border border-field px-3 text-sm hover:border-ink"
          >
            {t('community', { name: `z/${community.slug}` })}
          </Link>
        </p>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="programs-heading">
          <h2 id="programs-heading" className="mb-3 text-display-sm font-semibold">
            {t('programs')}
          </h2>
          {data.programs.length === 0 ? <p className="text-ink-muted">{t('noPrograms')}</p> : null}
          <div className="flex flex-col gap-8">
            {data.programs.map((program) => (
              <article key={program.id} aria-labelledby={`program-${program.id}`}>
                <h3 id={`program-${program.id}`} className="text-lg font-semibold">
                  {program.name}
                </h3>
                <p className="text-sm text-ink-muted">
                  {t('programMeta', {
                    level: t(`levels.${program.level}`),
                    years: program.durationYears,
                  })}
                </p>
                {program.years.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-muted">{t('noCourses')}</p>
                ) : (
                  <div className="mt-3 flex flex-col gap-4">
                    {program.years.map(({ year, courses }) => (
                      <div key={year}>
                        <h4 className="text-sm font-semibold text-ink-muted">
                          {t('year', { year })}
                        </h4>
                        <ul className="mt-1 divide-y divide-rule border-y border-rule">
                          {courses.map((course) => (
                            <li key={course.id}>
                              <Link
                                href={routes.course(faculty.slug, course.slug)}
                                className="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-paper-sunk"
                              >
                                <span>{course.name}</span>
                                {course.code ? (
                                  <span className="font-mono text-sm text-ink-muted">
                                    {course.code}
                                  </span>
                                ) : null}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
          {data.courses.length === 0 ? (
            <EmptyState
              className="mt-6"
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          ) : null}
        </section>

        <aside aria-labelledby="professors-heading">
          <h2 id="professors-heading" className="mb-3 font-sans text-base font-semibold">
            {t('professors')}
          </h2>
          {data.professors.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noProfessors')}</p>
          ) : (
            <ul className="flex flex-col">
              {data.professors.map((professor) => (
                <li key={professor.id}>
                  <Link
                    href={routes.professor(faculty.slug, professor.slug)}
                    className="flex min-h-11 items-center hover:underline"
                  >
                    {professor.title ? `${professor.title} ` : ''}
                    {professor.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
