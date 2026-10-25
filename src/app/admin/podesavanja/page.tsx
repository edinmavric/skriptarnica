import { getTranslations } from 'next-intl/server';

import { SettingsForm } from '@/components/features/admin/settings-form';
import { getSettings } from '@/server/services/settings';

export default async function AdminSettingsPage() {
  const t = await getTranslations('admin.settings');
  const settings = await getSettings();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="max-w-prose text-ink-muted">{t('intro')}</p>
      <SettingsForm initial={settings} />
    </div>
  );
}
