import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { UnsubscribeConfirm } from '@/components/features/settings/unsubscribe-confirm';
import { verifyUnsubscribeToken } from '@/server/email/unsubscribe';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Human unsubscribe page. Showing it changes nothing (link scanners open links). */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const token = (await searchParams).t ?? '';
  const parsed = verifyUnsubscribeToken(token);
  const t = await getTranslations('unsubscribe');
  const tTypes = await getTranslations('settings.notifications');
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-8">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {parsed ? (
        <>
          <p className="text-ink-muted">
            {parsed.scope === 'digest'
              ? t('digest')
              : t('type', { type: tTypes(`types.${parsed.scope}.label`) })}
          </p>
          <UnsubscribeConfirm token={token} />
        </>
      ) : (
        <p className="text-ink-muted">{t('invalid')}</p>
      )}
    </div>
  );
}
