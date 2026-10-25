import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { CounterNoticeForm } from '@/components/features/legal/counter-notice-form';
import { FormAlert } from '@/components/forms/form-alert';
import { routes } from '@/config/routes';
import { formatDate } from '@/lib/format';
import { requireAppUser } from '@/server/auth/session';
import { claimsForSellerNote } from '@/server/services/copyright';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Seller's counter-notice to an accepted copyright claim (SPEC §7.4). */
export default async function CounterNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAppUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const claims = await claimsForSellerNote(user.id, id);
  if (!claims) notFound();
  const t = await getTranslations('copyrightForm.counter');
  const open = claims.find((claim) => claim.status === 'accepted');
  const countered = claims.find((claim) => claim.status === 'countered');
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Link href={routes.sell} className="text-sm text-pen underline underline-offset-2">
        {t('back')}
      </Link>
      <h1 className="text-display font-bold">{t('title')}</h1>
      {open ? (
        <>
          <p>{t('intro', { date: open.decidedAt ? formatDate(open.decidedAt) : '' })}</p>
          {open.decisionNote ? (
            <p className="border-l-2 border-rule pl-3 text-ink-muted">{open.decisionNote}</p>
          ) : null}
          <CounterNoticeForm noteId={id} />
        </>
      ) : countered ? (
        <FormAlert tone="success" message={t('submitted')} />
      ) : (
        <p className="text-ink-muted">{t('none')}</p>
      )}
    </div>
  );
}
