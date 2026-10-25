import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { RefundDialog } from '@/components/features/purchase/refund-dialog';
import { ReviewDialog } from '@/components/features/purchase/review-dialog';
import { FormAlert } from '@/components/forms/form-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DownloadIcon } from '@/components/ui/icons';
import { routes } from '@/config/routes';
import { formatDate } from '@/lib/format';
import { requireAppUser } from '@/server/auth/session';
import { getLibrary } from '@/server/services/library';
import { getSettings } from '@/server/services/settings';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('library');
  return { title: t('title') };
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ greska?: string; nova?: string }>;
}) {
  const user = await requireAppUser();
  const [t, items, settings, params] = await Promise.all([
    getTranslations('library'),
    getLibrary(user.id),
    getSettings(),
    searchParams,
  ]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {params.greska ? (
        <FormAlert message={params.greska === 'pristup' ? t('errors.access') : t('errors.file')} />
      ) : null}
      {params.nova ? <FormAlert tone="success" message={t('added')} /> : null}
      {items.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button asChild>
              <Link href={routes.search}>{t('emptyAction')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {items.map((item) => (
            <li
              key={item.orderId}
              className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={routes.note(item.slug)} className="font-medium hover:underline">
                    {item.title}
                  </Link>
                  {item.hasNewVersion ? (
                    <Badge tone="marker">
                      {t('newVersion', { number: item.currentVersionNumber ?? 0 })}
                    </Badge>
                  ) : null}
                  {item.refundStatus ? (
                    <Badge tone={item.refundStatus === 'rejected' ? 'neutral' : 'warning'}>
                      {t(`refundStatus.${item.refundStatus}`)}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-ink-muted">
                  {item.courseName}, {t('bought', { date: formatDate(item.grantedAt) })}
                </p>
                {item.hasNewVersion && item.currentVersionChangelog ? (
                  <p className="mt-1 text-sm">{item.currentVersionChangelog}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <a href={`/api/preuzimanje/${item.noteId}`}>
                    <DownloadIcon /> {t('download')}
                  </a>
                </Button>
                {!item.reviewed ? (
                  <ReviewDialog orderId={item.orderId} title={item.title} />
                ) : (
                  <Badge tone="success">{t('reviewed')}</Badge>
                )}
                {item.canRequestRefund ? (
                  <RefundDialog orderId={item.orderId} days={settings.purchaseProblemWindowDays} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-ink-muted">{t('watermarkNote')}</p>
    </div>
  );
}
