import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { MyCourses } from '@/components/features/feed/my-courses';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { routes } from '@/config/routes';
import { requireAppUser } from '@/server/auth/session';
import { myCourses } from '@/server/services/feed';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('myCourses');
  return { title: t('title') };
}

export default async function MyCoursesPage() {
  const user = await requireAppUser();
  const [t, data] = await Promise.all([getTranslations('myCourses'), myCourses(user.id)]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        <p className="mt-2 max-w-prose text-ink-muted">{t('intro')}</p>
      </div>
      {data.courses.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button asChild>
              <Link href={routes.onboarding}>{t('emptyAction')}</Link>
            </Button>
          }
        />
      ) : (
        <MyCourses courses={data.courses} />
      )}
    </div>
  );
}
