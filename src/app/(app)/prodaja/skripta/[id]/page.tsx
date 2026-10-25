import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { NoteWizard } from '@/components/features/seller/note-wizard';
import { routes } from '@/config/routes';
import { requireAppUser } from '@/server/auth/session';
import { suggestedPricePara } from '@/server/services/notes';
import { getSettings } from '@/server/services/settings';
import { loadWizardNote } from '@/server/services/wizard';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ korak?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller.wizard');
  return { title: t('editTitle') };
}

export default async function EditNotePage({ params, searchParams }: Props) {
  const user = await requireAppUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await loadWizardNote(user, id);
  if (!data) notFound();
  const requested = Number((await searchParams).korak ?? data.note.wizardStep);
  // Published notes keep their file; a new file goes through "Nova verzija".
  const step =
    data.published && (requested === 2 || requested === 3)
      ? 4
      : Math.min(Math.max(1, requested || 1), data.note.wizardStep);
  if (data.published && requested === 2) redirect(`/prodaja/skripta/${id}/nova-verzija`);
  const [t, settings, suggested] = await Promise.all([
    getTranslations('seller.wizard'),
    getSettings(),
    data.note.courseId ? suggestedPricePara(data.note.courseId) : Promise.resolve(null),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-ink-muted">
          <a href={routes.sell} className="underline underline-offset-2">
            {t('backToDashboard')}
          </a>
        </p>
        <h1 className="mt-1 text-display font-bold">{data.note.title || t('editTitle')}</h1>
      </div>
      <NoteWizard
        note={data.note}
        step={step}
        maxPdfBytes={settings.maxPdfSizeBytes}
        commissionBasisPoints={settings.commissionBasisPoints}
        maxPricePara={settings.maxNotePricePara}
        suggestedPara={suggested}
        problems={data.problems}
      />
    </div>
  );
}
