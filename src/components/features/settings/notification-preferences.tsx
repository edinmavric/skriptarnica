'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import {
  notificationTypes,
  type NotificationChannel,
  type NotificationType,
} from '@/config/notifications';
import { setDigestAction, setNotificationPreferenceAction } from '@/server/actions/account';

type Digest = 'daily' | 'weekly' | 'none';

/** One select per notification type plus the digest frequency; every change saves at once. */
export function NotificationPreferences({
  initial,
  digest: initialDigest,
}: {
  initial: Record<NotificationType, NotificationChannel>;
  digest: Digest;
}) {
  const t = useTranslations('settings.notifications');
  const { toast } = useToast();
  const [channels, setChannels] = useState(initial);
  const [digest, setDigest] = useState(initialDigest);
  const [, startTransition] = useTransition();
  const done = (ok: boolean) =>
    toast({ title: ok ? t('saved') : t('error'), tone: ok ? 'success' : 'error' });

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <ul className="divide-y divide-rule border-y border-rule">
        {notificationTypes.map((type) => (
          <li
            key={type}
            className="grid gap-2 py-3 sm:grid-cols-[1fr_14rem] sm:items-center sm:gap-6"
          >
            <div>
              <p className="font-medium" id={`pref-${type}-label`}>
                {t(`types.${type}.label`)}
              </p>
              <p className="text-sm text-ink-muted">{t(`types.${type}.hint`)}</p>
            </div>
            <Select
              aria-labelledby={`pref-${type}-label`}
              value={channels[type]}
              onChange={(event) => {
                const channel = event.target.value as NotificationChannel;
                setChannels((current) => ({ ...current, [type]: channel }));
                startTransition(async () =>
                  done((await setNotificationPreferenceAction({ type, channel })).ok),
                );
              }}
            >
              <option value="in_app_email">{t('channels.in_app_email')}</option>
              <option value="in_app">{t('channels.in_app')}</option>
              <option value="none">{t('channels.none')}</option>
            </Select>
          </li>
        ))}
      </ul>
      <section aria-labelledby="digest-heading" className="flex flex-col gap-3">
        <h2 id="digest-heading" className="text-display-sm font-semibold">
          {t('digestTitle')}
        </h2>
        <p className="max-w-prose text-ink-muted">{t('digestIntro')}</p>
        <Field label={t('digestLabel')} className="max-w-xs">
          <Select
            value={digest}
            onChange={(event) => {
              const value = event.target.value as Digest;
              setDigest(value);
              startTransition(async () => done((await setDigestAction({ digest: value })).ok));
            }}
          >
            <option value="daily">{t('digest.daily')}</option>
            <option value="weekly">{t('digest.weekly')}</option>
            <option value="none">{t('digest.none')}</option>
          </Select>
        </Field>
      </section>
    </div>
  );
}
