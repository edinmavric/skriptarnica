import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import {
  AccountDeletionForm,
  CancelDeletionButton,
} from '@/components/features/settings/account-deletion';
import { DataExportButton } from '@/components/features/settings/data-export';
import { FormAlert } from '@/components/forms/form-alert';
import { ACCOUNT_DELETION_GRACE_DAYS, DATA_EXPORT_TTL_DAYS } from '@/config/notifications';
import { formatDate, formatDateTime, formatPrice } from '@/lib/format';
import { requireAppUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { deletionStatus, hasPassword } from '@/server/services/account-deletion';
import { latestExport } from '@/server/services/data-export';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings.data');
  return { title: t('title') };
}

export default async function DataSettingsPage() {
  const user = await requireAppUser();
  const t = await getTranslations('settings.data');
  const [[row], latest, status, password] = await Promise.all([
    db
      .select({
        scheduledFor: users.deletionScheduledFor,
        deleteContent: users.deletionDeleteContent,
      })
      .from(users)
      .where(eq(users.id, user.id)),
    latestExport(user.id),
    deletionStatus(user.id),
    hasPassword(user.id),
  ]);
  const exportReady =
    latest?.status === 'ready' && latest.expiresAt && latest.expiresAt > new Date();
  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-display font-bold">{t('title')}</h1>

      <section aria-labelledby="export-heading" className="flex flex-col gap-3">
        <h2 id="export-heading" className="text-display-sm font-semibold">
          {t('export.title')}
        </h2>
        <p className="max-w-prose text-ink-muted">
          {t('export.intro', { days: DATA_EXPORT_TTL_DAYS })}
        </p>
        {latest?.status === 'pending' ? (
          <p role="status" className="max-w-prose rounded-md bg-pen-soft px-3 py-2">
            {t('export.pending')}
          </p>
        ) : null}
        {exportReady ? (
          <p>
            <a
              href={`/api/izvoz/${latest.id}`}
              className="font-medium text-pen underline underline-offset-2"
              download
            >
              {t('export.download', { date: formatDateTime(latest.readyAt ?? latest.createdAt) })}
            </a>
          </p>
        ) : null}
        <DataExportButton pending={latest?.status === 'pending'} />
      </section>

      <section aria-labelledby="delete-heading" className="flex flex-col gap-3">
        <h2 id="delete-heading" className="text-display-sm font-semibold">
          {t('delete.title')}
        </h2>
        {row?.scheduledFor ? (
          <>
            <FormAlert message={t('delete.scheduled', { date: formatDate(row.scheduledFor) })} />
            <p className="max-w-prose text-ink-muted">
              {row.deleteContent ? t('delete.scheduledDelete') : t('delete.scheduledKeep')}
            </p>
            <CancelDeletionButton />
          </>
        ) : (
          <>
            <p className="max-w-prose text-ink-muted">
              {t('delete.intro', { days: ACCOUNT_DELETION_GRACE_DAYS })}
            </p>
            <ul className="max-w-prose list-disc space-y-1 pl-5 text-ink-muted">
              {(['personal', 'notes', 'library', 'money'] as const).map((key) => (
                <li key={key}>{t(`delete.points.${key}`)}</li>
              ))}
            </ul>
            <AccountDeletionForm
              hasPassword={password}
              balance={status.balancePara > 0 ? formatPrice(status.balancePara) : null}
              openPayout={status.openPayout}
            />
          </>
        )}
      </section>
    </div>
  );
}
