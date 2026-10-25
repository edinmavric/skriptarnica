import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { eq } from 'drizzle-orm';

import {
  OnboardingFlow,
  type OnboardingData,
} from '@/components/features/onboarding/onboarding-flow';
import { routes } from '@/config/routes';
import { db } from '@/server/db/client';
import { userCourseStatus } from '@/server/db/schema';
import { getStudentProfile, requireAppUser } from '@/server/auth/session';
import {
  listProgramCoursesUpToYear,
  listProgramsForFaculty,
  listUniversitiesWithFaculties,
} from '@/server/services/catalog';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('title') };
}

export default async function OnboardingPage() {
  const user = await requireAppUser();
  const profile = await getStudentProfile(user.id);
  if (profile?.onboardingStep === 'done') redirect(routes.home);
  const t = await getTranslations('onboarding');

  const needsUsername = !user.username;
  const stored = (profile?.onboardingStep ?? 'program') as OnboardingData['step'];
  const step: OnboardingData['step'] = needsUsername ? 'username' : stored;

  const [universities, programs, courses, statuses] = await Promise.all([
    listUniversitiesWithFaculties(),
    profile?.facultyId ? listProgramsForFaculty(profile.facultyId) : Promise.resolve([]),
    profile?.programId && profile.year
      ? listProgramCoursesUpToYear(profile.programId, Math.min(profile.year + 1, 6))
      : Promise.resolve([]),
    db
      .select({
        courseId: userCourseStatus.courseId,
        status: userCourseStatus.status,
        grade: userCourseStatus.grade,
      })
      .from(userCourseStatus)
      .where(eq(userCourseStatus.userId, user.id)),
  ]);

  const data: OnboardingData = {
    step,
    needsUsername,
    universities,
    profile: {
      universityId: profile?.universityId ?? null,
      facultyId: profile?.facultyId ?? null,
      programId: profile?.programId ?? null,
      year: profile?.year ?? null,
    },
    programs,
    courses,
    statuses,
    studentVerified: Boolean(profile?.studentVerifiedAt),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        <p className="mt-2 max-w-prose text-ink-muted">{t('intro')}</p>
      </div>
      <OnboardingFlow data={data} />
    </div>
  );
}
