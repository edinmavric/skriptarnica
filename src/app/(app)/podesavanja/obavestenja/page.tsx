import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { NotificationPreferences } from '@/components/features/settings/notification-preferences';
import { requireAppUser } from '@/server/auth/session';
import { getDigestFrequency, getPreferences } from '@/server/services/notifications';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.notifications');
  return { title: t('title') };
}

export default async function NotificationSettingsPage() {
  const user = await requireAppUser();
  const t = await getTranslations('settings.notifications');
  const [preferences, digest] = await Promise.all([
    getPreferences(user.id),
    getDigestFrequency(user.id),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="max-w-prose text-ink-muted">{t('intro')}</p>
      <NotificationPreferences initial={preferences} digest={digest} />
    </div>
  );
}
