import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { routes } from '@/config/routes';

/** Notes for a course. The listing with filters and sorting is filled in with the marketplace. */
export async function CourseNotes(_props: {
  courseId: string;
  facultySlug: string;
  courseSlug: string;
  professors: { id: string; name: string; title: string | null; slug: string }[];
  searchParams: Record<string, string | undefined>;
}) {
  const t = await getTranslations('catalog.course');
  return (
    <section aria-labelledby="notes-heading" className="mt-10">
      <h2 id="notes-heading" className="mb-4 text-display-sm font-semibold">
        {t('notes')}
      </h2>
      <EmptyState
        title={t('noNotesTitle')}
        description={t('noNotesDescription')}
        action={
          <Button asChild>
            <Link href={routes.sellNew}>{t('sellCta')}</Link>
          </Button>
        }
      />
    </section>
  );
}
