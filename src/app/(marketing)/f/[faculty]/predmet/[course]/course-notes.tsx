import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { AutoSubmitForm } from '@/components/features/notes/auto-submit-form';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ChevronDownIcon, FilterIcon } from '@/components/ui/icons';
import { NoteRow } from '@/components/ui/note-card';
import { Pagination } from '@/components/ui/pagination';
import { routes } from '@/config/routes';
import { courseNotesQuerySchema } from '@/lib/validation/notes';
import { listCourseNotes } from '@/server/services/note-pages';

const selectClass = 'min-h-11 rounded-md border border-field bg-paper-raised px-3 text-[0.95rem]';

/** Notes for a course with filters (professor, price, rating, year passed, free) and sorting. */
export async function CourseNotes({
  courseId,
  facultySlug,
  courseSlug,
  professors,
  searchParams,
}: {
  courseId: string;
  facultySlug: string;
  courseSlug: string;
  professors: { id: string; name: string; title: string | null; slug: string }[];
  searchParams: Record<string, string | undefined>;
}) {
  const t = await getTranslations('catalog.course');
  const parsed = courseNotesQuerySchema.safeParse(searchParams);
  const query = parsed.success ? parsed.data : {};
  const data = await listCourseNotes(courseId, query);
  const base = routes.course(facultySlug, courseSlug);
  const hrefFor = (page: number) => {
    const params = new URLSearchParams(
      Object.entries({ ...query, strana: String(page) }).flatMap(([k, v]) =>
        v ? [[k, String(v)]] : [],
      ),
    );
    return `${base}?${params}`;
  };
  const activeFilters = Object.entries(query).filter(
    ([key, value]) => key !== 'sort' && key !== 'strana' && Boolean(value),
  ).length;
  const filtered = activeFilters > 0;

  return (
    <section aria-labelledby="notes-heading" className="mt-10">
      <AutoSubmitForm label={t('filtersLabel')} className="mb-2 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-baseline gap-3">
            <h2 id="notes-heading" className="text-display-sm font-semibold">
              {t('notes')}
            </h2>
            <p className="text-sm text-ink-muted">{t('notesCount', { count: data.total })}</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">{t('sort')}</span>
            <select name="sort" defaultValue={query.sort ?? 'preporuceno'} className={selectClass}>
              {(
                [
                  'preporuceno',
                  'ocena',
                  'prodaja',
                  'najnovije',
                  'cena-rastuce',
                  'cena-opadajuce',
                ] as const
              ).map((value) => (
                <option key={value} value={value}>
                  {t(`sorts.${value}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details open={activeFilters > 0} className="group/filters flex flex-col gap-2">
          <summary className="inline-flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-md border border-field bg-paper-raised px-3 text-sm font-medium hover:border-ink [&::-webkit-details-marker]:hidden">
            <FilterIcon className="size-4" aria-hidden />
            {activeFilters > 0 ? t('filtersActive', { count: activeFilters }) : t('filters')}
            <ChevronDownIcon
              className="size-4 transition-transform group-open/filters:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-3 rounded-md bg-paper-sunk p-3">
            {professors.length > 0 ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{t('professor')}</span>
                <select name="profesor" defaultValue={query.profesor ?? ''} className={selectClass}>
                  <option value="">{t('any')}</option>
                  {professors.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t('price')}</span>
              <select name="cena" defaultValue={query.cena ?? ''} className={selectClass}>
                <option value="">{t('any')}</option>
                {(['besplatne', 'do500', 'do1000'] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`prices.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">{t('rating')}</span>
              <select name="ocena" defaultValue={query.ocena ?? ''} className={selectClass}>
                <option value="">{t('any')}</option>
                <option value="4">{t('ratingAtLeast', { value: '4' })}</option>
                <option value="4.5">{t('ratingAtLeast', { value: '4,5' })}</option>
              </select>
            </label>
            {data.academicYears.length > 0 ? (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{t('yearPassed')}</span>
                <select name="godina" defaultValue={query.godina ?? ''} className={selectClass}>
                  <option value="">{t('any')}</option>
                  {data.academicYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <noscript>
              <Button type="submit" variant="secondary">
                {t('apply')}
              </Button>
            </noscript>
            {activeFilters > 0 ? (
              <Link
                href={base}
                className="min-h-11 content-center text-sm text-pen underline underline-offset-2"
              >
                {t('clearFilters')}
              </Link>
            ) : null}
          </div>
        </details>
      </AutoSubmitForm>

      {data.cards.length === 0 ? (
        filtered ? (
          <EmptyState
            title={t('noMatchTitle')}
            description={t('noMatchDescription')}
            action={
              <Button asChild variant="secondary">
                <Link href={base}>{t('clearFilters')}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('noNotesTitle')}
            description={t('noNotesDescription')}
            action={
              <Button asChild>
                <Link href={routes.sellNew}>{t('sellCta')}</Link>
              </Button>
            }
          />
        )
      ) : (
        <>
          <ul className="divide-y divide-rule border-y border-rule">
            {data.cards.map((card) => (
              <li key={card.id}>
                <NoteRow note={card} />
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pageCount={data.pageCount} hrefFor={hrefFor} />
        </>
      )}
    </section>
  );
}
