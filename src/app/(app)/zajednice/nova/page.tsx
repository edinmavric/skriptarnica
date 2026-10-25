import { asc, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { CreateCommunityForm } from '@/components/features/forum/create-community-form';
import { getStudentProfile, requireAppUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { professors } from '@/server/db/schema';
import { getSettings } from '@/server/services/settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('forum.create');
  return { title: t('title') };
}

export default async function CreateCommunityPage() {
  const user = await requireAppUser();
  const [t, profile, settings] = await Promise.all([
    getTranslations('forum.create'),
    getStudentProfile(user.id),
    getSettings(),
  ]);
  const professorRows = profile?.facultyId
    ? await db
        .select({ id: professors.id, name: professors.name, title: professors.title })
        .from(professors)
        .where(eq(professors.facultyId, profile.facultyId))
        .orderBy(asc(professors.name))
    : [];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        <p className="mt-2 max-w-prose text-ink-muted">
          {t('intro', {
            days: settings.minAccountAgeDaysToCreateCommunity,
            max: settings.maxCommunitiesPerUser,
          })}
        </p>
      </div>
      <CreateCommunityForm
        professors={professorRows.map((p) => ({
          id: p.id,
          name: p.title ? `${p.title} ${p.name}` : p.name,
        }))}
        hasFaculty={Boolean(profile?.facultyId)}
      />
    </div>
  );
}
