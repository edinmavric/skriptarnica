import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ConfirmDeletionByLink } from '@/components/features/settings/confirm-deletion';
import { requireAppUser } from '@/server/auth/session';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Email-link confirmation for accounts without a password. GET only shows a button. */
export default async function ConfirmDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  await requireAppUser();
  const t = await getTranslations('settings.data.delete');
  const token = (await searchParams).t ?? '';
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-display font-bold">{t('confirmTitle')}</h1>
      <p className="text-ink-muted">{t('confirmIntro')}</p>
      <ConfirmDeletionByLink token={token} />
    </div>
  );
}
