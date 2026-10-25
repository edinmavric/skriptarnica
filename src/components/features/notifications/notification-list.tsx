'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { markNotificationsReadAction } from '@/server/actions/account';
import type { NotificationView } from '@/server/services/notifications';

/** Notifications page list: unread ones are marked; opening one marks it read. */
export function NotificationList({ items }: { items: NotificationView[] }) {
  const t = useTranslations('notifications');
  const tItem = useTranslations('notifications.items') as unknown as (
    key: string,
    values: Record<string, string | number>,
  ) => string;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unread = items.filter((item) => !item.readAt).length;
  return (
    <div className="flex flex-col gap-4">
      {unread > 0 ? (
        <Button
          variant="secondary"
          className="self-start"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              await markNotificationsReadAction({ ids: 'all' });
              router.refresh();
            })
          }
        >
          {t('markAll')}
        </Button>
      ) : null}
      <ul className="divide-y divide-rule border-y border-rule">
        {items.map((item) => {
          const values = Object.fromEntries(
            Object.entries(item.payload).map(([key, value]) => [
              key,
              value ?? (key === 'actor' ? t('anonymous') : ''),
            ]),
          );
          return (
            <li key={item.id} className={cn(!item.readAt && 'bg-pen-soft/40')}>
              <Link
                href={item.payload.href}
                onClick={() => {
                  if (!item.readAt) void markNotificationsReadAction({ ids: [item.id] });
                }}
                className="flex gap-3 px-3 py-3 hover:bg-paper-sunk"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'mt-2 size-2 shrink-0 rounded-full',
                    item.readAt ? 'bg-transparent' : 'bg-pen',
                  )}
                />
                <span className="min-w-0">
                  <span className={cn('block', !item.readAt && 'font-medium')}>
                    {!item.readAt ? <span className="sr-only">{t('unread')} </span> : null}
                    {tItem(item.type, values)}
                  </span>
                  <time
                    dateTime={item.createdAt}
                    className="text-sm text-ink-muted"
                    suppressHydrationWarning
                  >
                    {formatRelative(item.createdAt)}
                  </time>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
