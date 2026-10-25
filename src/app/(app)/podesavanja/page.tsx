import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { AccountForm } from '@/components/features/settings/account-form';
import { AvatarForm } from '@/components/features/settings/avatar-form';
import { routes } from '@/config/routes';
import { getStudentProfile, requireAppUser } from '@/server/auth/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.account');
  return { title: t('title') };
}

export default async function AccountSettingsPage() {
  const user = await requireAppUser();
  const profile = await getStudentProfile(user.id);
  const t = await getTranslations('settings.account');
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        {user.username ? (
          <p className="mt-1 text-ink-muted">
            <Link
              href={routes.user(user.username)}
              className="text-pen underline underline-offset-2"
            >
              {t('viewProfile')}
            </Link>
          </p>
        ) : null}
      </div>
      <section aria-labelledby="avatar-heading" className="flex flex-col gap-3">
        <h2 id="avatar-heading" className="text-display-sm font-semibold">
          {t('avatar')}
        </h2>
        <AvatarForm name={user.name} image={user.image} />
      </section>
      <section aria-labelledby="profile-heading" className="flex flex-col gap-3">
        <h2 id="profile-heading" className="text-display-sm font-semibold">
          {t('profile')}
        </h2>
        <AccountForm
          defaults={{ name: user.name, username: user.username ?? '', bio: profile?.bio ?? '' }}
          email={user.email}
        />
        <p className="max-w-prose text-sm text-ink-muted">
          {t('programHint')}{' '}
          <Link href={routes.onboarding} className="text-pen underline underline-offset-2">
            {t('programLink')}
          </Link>
        </p>
      </section>
    </div>
  );
}
