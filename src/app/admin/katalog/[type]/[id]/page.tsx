import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { CatalogForm } from '@/components/features/admin/catalog-form';
import { CourseLinks } from '@/components/features/admin/course-links';
import { catalogEntityTypes, type CatalogEntityType } from '@/lib/validation/admin';
import {
  catalogOptions,
  courseLinks,
  facultyCatalog,
  getCatalogItem,
} from '@/server/services/admin/catalog-admin';

function initialValues(item: Record<string, unknown> | null): Record<string, string> {
  if (!item) return { level: 'oas', durationYears: '4' };
  return Object.fromEntries(
    Object.entries(item)
      .filter(([key]) => !['id', 'createdAt', 'updatedAt', 'searchText', 'searchTsv'].includes(key))
      .map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.join(', ')
          : value === null || value === undefined
            ? ''
            : String(value),
      ]),
  );
}

export default async function AdminCatalogItemPage({
  params,
}: {
  params: Promise<{ type: string; id: string }>;
}) {
  const { type: rawType, id } = await params;
  if (!catalogEntityTypes.includes(rawType as CatalogEntityType)) notFound();
  const type = rawType as CatalogEntityType;
  const isNew = id === 'novi';
  if (!isNew && !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const item = isNew ? null : await getCatalogItem(type, id);
  if (!isNew && !item) notFound();
  const t = await getTranslations('admin.catalog');
  const options = await catalogOptions();
  const course = type === 'course' && item && 'facultyId' in item ? item : null;
  const [links, facultyOptions] = course
    ? await Promise.all([courseLinks(course.id), facultyCatalog(course.facultyId)])
    : [null, null];
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href={`/admin/katalog?tip=${type}`}
          className="text-sm text-pen underline underline-offset-2"
        >
          {t(`plural.${type}`)}
        </Link>
        <h1 className="text-display font-bold">{isNew ? t(`new.${type}`) : item?.name}</h1>
      </div>
      <CatalogForm
        type={type}
        {...(isNew ? {} : { id })}
        initial={initialValues(item as Record<string, unknown> | null)}
        universities={options.universities}
        faculties={options.faculties}
      />
      {course && links && facultyOptions ? (
        <CourseLinks
          courseId={course.id}
          placements={links.placements}
          linkedProfessors={links.professors.map((p) => ({ id: p.id, label: p.name }))}
          programs={facultyOptions.programs}
          professors={facultyOptions.professors}
        />
      ) : null}
    </div>
  );
}
