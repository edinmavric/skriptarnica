import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { CourseProposalDialog } from '@/components/features/courses/course-proposal-dialog';
import { MyCourses } from '@/components/features/feed/my-courses';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { routes } from '@/config/routes';
import { formatDate } from '@/lib/format';
import { requireAppUser } from '@/server/auth/session';
import { myCourseProposals, proposalContext } from '@/server/services/course-proposals';
import { myCourses } from '@/server/services/feed';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('myCourses');
  return { title: t('title') };
}

export default async function MyCoursesPage() {
  const user = await requireAppUser();
  const [t, data, target, proposals] = await Promise.all([
    getTranslations('myCourses'),
    myCourses(user.id),
    proposalContext(user.id),
    myCourseProposals(user.id),
  ]);
  const proposalTarget = target
    ? {
        programName: target.programName,
        facultyShortName: target.facultyShortName,
        durationYears: target.durationYears,
        year: target.year,
      }
    : null;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        <p className="mt-2 max-w-prose text-ink-muted">{t('intro')}</p>
        {proposalTarget ? (
          <div className="mt-3">
            <CourseProposalDialog target={proposalTarget} />
          </div>
        ) : null}
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
      {proposals.length > 0 ? (
        <section aria-labelledby="proposals-heading">
          <h2 id="proposals-heading" className="mb-3 text-display-sm font-semibold">
            {t('proposals.title')}
          </h2>
          <ul className="divide-y divide-rule border-y border-rule">
            {proposals.map((proposal) => (
              <li key={proposal.id} className="flex flex-col gap-1 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{proposal.name}</span>
                  <Badge tone={proposalTone[proposal.status]}>
                    {t(`proposals.status.${proposal.status}`)}
                  </Badge>
                </div>
                <p className="text-sm text-ink-muted">
                  {proposal.year ? `${t('proposals.year', { year: proposal.year })}, ` : ''}
                  {formatDate(proposal.createdAt)}
                </p>
                {proposal.status === 'rejected' && proposal.rejectionReason ? (
                  <p className="text-sm">
                    {t('proposals.reason', { reason: proposal.rejectionReason })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

const proposalTone = { pending: 'warning', approved: 'success', rejected: 'danger' } as const;
