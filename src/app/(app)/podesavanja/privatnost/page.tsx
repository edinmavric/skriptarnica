import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PrivacyForm } from '@/components/features/settings/privacy-form';
import { getStudentProfile, requireAppUser } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.privacy');
  return { title: t('title') };
}

export default async function PrivacySettingsPage() {
  const user = await requireAppUser();
  const profile = await getStudentProfile(user.id);
  const t = await getTranslations('settings.privacy');
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="max-w-prose text-ink-muted">{t('intro')}</p>
      <PrivacyForm
        initial={{
          showFaculty: profile?.showFaculty ?? true,
          showProgram: profile?.showProgram ?? true,
          showActivity: profile?.showActivity ?? true,
        }}
      />
      <p className="max-w-prose text-sm text-ink-muted">{t('always')}</p>
    </div>
  );
}
