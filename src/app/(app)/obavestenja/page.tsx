import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { NotificationList } from '@/components/features/notifications/notification-list';
import { EmptyState } from '@/components/ui/empty-state';
import { routes } from '@/config/routes';
import { requireAppUser } from '@/server/auth/session';
import { listNotifications } from '@/server/services/notifications';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notifications');
  return { title: t('title') };
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ pre?: string }>;
}) {
  const user = await requireAppUser();
  const t = await getTranslations('notifications');
  const before = (await searchParams).pre;
  const page = await listNotifications(
    user.id,
    before && !Number.isNaN(Date.parse(before)) ? before : undefined,
  );
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-display font-bold">{t('title')}</h1>
        <Link
          href={`${routes.settings}/obavestenja`}
          className="text-sm text-pen underline underline-offset-2"
        >
          {t('settings')}
        </Link>
      </div>
      {page.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <NotificationList items={page.items} />
      )}
      {page.nextCursor ? (
        <Link
          href={`${routes.notifications}?pre=${encodeURIComponent(page.nextCursor)}`}
          className="self-start text-pen underline underline-offset-2"
        >
          {t('older')}
        </Link>
      ) : null}
    </div>
  );
}
