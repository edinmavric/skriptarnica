import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { routes } from '@/config/routes';
import { pageMetadata } from '@/lib/seo/metadata';
import { getUniversityPage } from '@/server/services/catalog-pages';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await getUniversityPage((await params).slug);
  if (!data) return {};
  const t = await getTranslations('catalog.university');
  return pageMetadata({
    title: data.university.name,
    description: t('metaDescription', { name: data.university.name, count: data.faculties.length }),
    path: routes.university(data.university.slug),
  });
}

export default async function UniversityPage({ params }: Props) {
  const data = await getUniversityPage((await params).slug);
  if (!data) notFound();
  const t = await getTranslations('catalog.university');
  return (
    <div>
      <Breadcrumbs
        items={[
          { label: t('home'), href: routes.home },
          { label: data.university.name, href: routes.university(data.university.slug) },
        ]}
      />
      <h1 className="text-display font-bold">{data.university.name}</h1>
      <p className="mt-1 text-ink-muted">{data.university.city}</p>
      <h2 className="mt-8 mb-3 text-display-sm font-semibold">{t('faculties')}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.faculties.map((faculty) => (
          <li key={faculty.id}>
            <Link
              href={routes.faculty(faculty.slug)}
              className="flex h-full flex-col rounded-md border border-rule bg-paper-raised p-4 hover:border-ink"
            >
              <span className="font-display text-lg font-semibold">{faculty.name}</span>
              <span className="text-sm text-ink-muted">
                {faculty.shortName}, {faculty.city}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
