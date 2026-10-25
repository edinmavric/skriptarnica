import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { BookmarkIcon, LibraryIcon, PencilIcon } from '@/components/ui/icons';
import { NoteCard } from '@/components/ui/note-card';
import { routes } from '@/config/routes';
import { formatDate } from '@/lib/format';
import type { CurrentUser } from '@/server/auth/session';
import { getStudentProfile } from '@/server/auth/session';
import { feedCounters, upcomingExamPeriods } from '@/server/services/feed';
import { listTopNotes } from '@/server/services/note-pages';
import { candidateCourses, getRecommendations } from '@/server/services/recommendations';

/** Logged-in home (SPEC §4.2). Community activity is filled in by the communities feature. */
export async function HomeFeed({
  user,
  communityActivity,
}: {
  user: CurrentUser;
  communityActivity?: ReactNode;
}) {
  const t = await getTranslations('feed');
  const tPeriods = await getTranslations('examPeriods');
  const [profile, recommendations, exams, counters, candidates] = await Promise.all([
    getStudentProfile(user.id),
    getRecommendations(user.id),
    upcomingExamPeriods(user.id),
    feedCounters(user.id),
    candidateCourses(user.id),
  ]);
  const firstName = user.name.split(' ')[0] ?? user.name;
  const onboardingDone = profile?.onboardingStep === 'done';
  // With nothing to recommend, show what's popular so the home page is never a dead end.
  const popular = recommendations.length === 0 ? await listTopNotes(8, user.id) : [];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-display font-bold">{t('greeting', { name: firstName })}</h1>
        <nav aria-label={t('quickAccess')} className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href="/moji-predmeti">
              <PencilIcon /> {t('myCourses', { count: counters.courses })}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={routes.saved}>
              <BookmarkIcon /> {t('saved', { count: counters.saved })}
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link href={routes.library}>
              <LibraryIcon /> {t('library', { count: counters.owned })}
            </Link>
          </Button>
        </nav>
      </div>

      {!onboardingDone ? (
        <p className="rounded-md bg-marker-soft px-4 py-3">
          {t('finishOnboarding')}{' '}
          <Link href={routes.onboarding} className="font-medium underline underline-offset-2">
            {t('finishOnboardingCta')}
          </Link>
        </p>
      ) : null}

      {exams.length > 0 ? (
        <section
          aria-labelledby="exams-heading"
          className="rounded-lg border border-rule bg-paper-raised p-4 sm:p-5"
        >
          <h2 id="exams-heading" className="text-display-sm font-semibold">
            {t('examsTitle')}
          </h2>
          <ul className="mt-3 flex flex-col divide-y divide-rule">
            {exams.map((exam) => (
              <li key={exam.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">{exam.courseName}</span>, {tPeriods(exam.period)}{' '}
                  {exam.academicYear}
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone="warning">
                    {t('startsOn', { date: formatDate(`${exam.startsOn}T12:00:00Z`) })}
                  </Badge>
                  <Link
                    href={routes.course(exam.facultySlug, exam.courseSlug)}
                    className="text-sm text-pen underline underline-offset-2"
                  >
                    {t('notesForCourse', { count: exam.noteCount })}
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="for-you-heading">
        <h2 id="for-you-heading" className="mb-4 text-display-sm font-semibold">
          {t('forYourCourses')}
        </h2>
        {recommendations.length > 0 ? (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {recommendations.map((card, index) => (
              <li key={card.id}>
                <NoteCard note={card} priority={index < 2} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title={
              candidates.size > 0
                ? t('noNotesTitle')
                : counters.courses > 0
                  ? t('onlyPassedTitle')
                  : t('noCoursesTitle')
            }
            description={
              candidates.size > 0
                ? t('noNotesDescription')
                : counters.courses > 0
                  ? t('onlyPassedDescription')
                  : t('noCoursesDescription')
            }
            action={
              candidates.size > 0 ? (
                <Button asChild>
                  <Link href={routes.sellNew}>{t('noNotesAction')}</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href={onboardingDone ? '/moji-predmeti' : routes.onboarding}>
                    {t('noCoursesAction')}
                  </Link>
                </Button>
              )
            }
          />
        )}
      </section>

      {popular.length > 0 ? (
        <section aria-labelledby="popular-heading">
          <h2 id="popular-heading" className="mb-4 text-display-sm font-semibold">
            {t('popularTitle')}
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
            {popular.map((card) => (
              <li key={card.id}>
                <NoteCard note={card} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {communityActivity}
    </div>
  );
}
