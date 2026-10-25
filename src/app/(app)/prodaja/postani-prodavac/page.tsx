import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { BecomeSellerForm } from '@/components/features/seller/become-seller-form';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { defaults } from '@/config/constants';
import { routes } from '@/config/routes';
import { formatPrice } from '@/lib/format';
import { requireAppUser } from '@/server/auth/session';
import { getSellerProfile, isActiveSeller } from '@/server/services/sellers';
import { getSettings } from '@/server/services/settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller.become');
  return { title: t('title') };
}

export default async function BecomeSellerPage() {
  const user = await requireAppUser();
  if (isActiveSeller(await getSellerProfile(user.id))) redirect(routes.sell);
  const [t, settings] = await Promise.all([getTranslations('seller.become'), getSettings()]);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-display font-bold">{t('title')}</h1>
        <p className="mt-2 max-w-prose text-ink-muted">
          {t('intro', {
            percent: settings.commissionBasisPoints / 100,
            days: settings.fundsHoldDays,
            min: formatPrice(settings.minPayoutPara),
            first: defaults.preModeratedNotesCount,
          })}
        </p>
      </div>
      {user.emailVerified ? (
        <BecomeSellerForm />
      ) : (
        <div className="flex max-w-lg flex-col gap-3">
          <FormAlert message={t('verifyFirst')} />
          <Button asChild variant="secondary" className="self-start">
            <Link href={routes.verifyEmailPending}>{t('verifyCta')}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
