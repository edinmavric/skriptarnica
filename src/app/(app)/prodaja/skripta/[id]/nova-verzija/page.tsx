import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { NewVersion } from '@/components/features/seller/new-version';
import { routes } from '@/config/routes';
import { requireAppUser } from '@/server/auth/session';
import { getSettings } from '@/server/services/settings';
import { loadWizardNote } from '@/server/services/wizard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller.newVersion');
  return { title: t('title') };
}

export default async function NewVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAppUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await loadWizardNote(user, id);
  if (!data || !data.published) notFound();
  const [t, settings] = await Promise.all([getTranslations('seller.newVersion'), getSettings()]);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        <a href={routes.sell} className="underline underline-offset-2">
          {t('back')}
        </a>
      </p>
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="max-w-prose text-ink-muted">{t('intro', { title: data.note.title })}</p>
      <NewVersion noteId={id} maxBytes={settings.maxPdfSizeBytes} />
    </div>
  );
}
