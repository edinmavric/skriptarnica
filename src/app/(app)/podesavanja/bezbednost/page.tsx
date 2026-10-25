import { and, eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { TwoFactorSettings } from '@/components/features/settings/two-factor-settings';
import { requireAppUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { accounts } from '@/server/db/schema';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.security');
  return { title: t('title') };
}

export default async function SecuritySettingsPage() {
  const user = await requireAppUser();
  const t = await getTranslations('settings.security');
  const [credential] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')));
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <section aria-labelledby="twofa-heading" className="flex flex-col gap-3">
        <h2 id="twofa-heading" className="text-display-sm font-semibold">
          {t('twoFactor')}
        </h2>
        <p className="max-w-prose text-ink-muted">{t('twoFactorIntro')}</p>
        <TwoFactorSettings
          enabled={user.twoFactorEnabled}
          isAdmin={user.role === 'admin'}
          hasPassword={Boolean(credential)}
        />
      </section>
    </div>
  );
}
