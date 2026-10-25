import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { NoteWizard } from '@/components/features/seller/note-wizard';
import { routes } from '@/config/routes';
import { requireAppUser } from '@/server/auth/session';
import { getSellerProfile, isActiveSeller } from '@/server/services/sellers';
import { getSettings } from '@/server/services/settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller.wizard');
  return { title: t('newTitle') };
}

export default async function NewNotePage() {
  const user = await requireAppUser();
  if (!isActiveSeller(await getSellerProfile(user.id))) redirect(routes.becomeSeller);
  const [t, settings] = await Promise.all([getTranslations('seller.wizard'), getSettings()]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('newTitle')}</h1>
      <NoteWizard
        note={null}
        step={1}
        maxPdfBytes={settings.maxPdfSizeBytes}
        commissionBasisPoints={settings.commissionBasisPoints}
        maxPricePara={settings.maxNotePricePara}
        suggestedPara={null}
        problems={[]}
      />
    </div>
  );
}
