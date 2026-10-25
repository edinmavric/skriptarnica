'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { banMemberAction, resolveReportAction, setModeratorAction } from '@/server/actions/forum';

export function BanForm({ communityId }: { communityId: string }) {
  const t = useTranslations('forum.moderation');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [duration, setDuration] = useState('24');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex max-w-md flex-col gap-3">
      <FormAlert tone={message?.tone ?? 'error'} message={message?.text ?? null} />
      <Field label={t('username')}>
        <Input
          value={username}
          onChange={(event) => setUsername(event.target.value.trim())}
          autoCapitalize="none"
        />
      </Field>
      <Field label={t('duration')}>
        <Select value={duration} onChange={(event) => setDuration(event.target.value)}>
          <option value="24">{t('durations.day')}</option>
          <option value="168">{t('durations.week')}</option>
          <option value="720">{t('durations.month')}</option>
          <option value="permanent">{t('durations.permanent')}</option>
        </Select>
      </Field>
      <Field label={t('reason')}>
        <Input value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <div className="flex gap-2">
        {(['ban', 'unban'] as const).map((kind) => (
          <Button
            key={kind}
            variant={kind === 'ban' ? 'danger' : 'secondary'}
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await banMemberAction({
                  communityId,
                  username,
                  hours: duration === 'permanent' ? null : Number(duration),
                  reason: reason || null,
                  lift: kind === 'unban',
                });
                setMessage(
                  result.ok
                    ? { tone: 'success', text: kind === 'ban' ? t('banned') : t('unbanned') }
                    : { tone: 'error', text: tAll(result.error.messageKey) },
                );
                if (result.ok) router.refresh();
              })
            }
          >
            {kind === 'ban' ? t('ban') : t('unban')}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ModeratorForm({ communityId }: { communityId: string }) {
  const t = useTranslations('forum.moderation');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex max-w-md flex-col gap-3">
      <FormAlert tone={message?.tone ?? 'error'} message={message?.text ?? null} />
      <Field label={t('username')}>
        <Input
          value={username}
          onChange={(event) => setUsername(event.target.value.trim())}
          autoCapitalize="none"
        />
      </Field>
      <div className="flex gap-2">
        {[true, false].map((makeModerator) => (
          <Button
            key={String(makeModerator)}
            variant="secondary"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setModeratorAction({ communityId, username, makeModerator });
                setMessage(
                  result.ok
                    ? { tone: 'success', text: t('saved') }
                    : { tone: 'error', text: tAll(result.error.messageKey) },
                );
                if (result.ok) router.refresh();
              })
            }
          >
            {makeModerator ? t('addModerator') : t('removeModerator')}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ReportResolution({ reportId }: { reportId: string }) {
  const t = useTranslations('forum.moderation');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex gap-2">
      {(['resolved', 'dismissed'] as const).map((resolution) => (
        <Button
          key={resolution}
          size="sm"
          variant={resolution === 'resolved' ? 'primary' : 'secondary'}
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              await resolveReportAction({ reportId, resolution, note: null });
              router.refresh();
            })
          }
        >
          {t(`resolution.${resolution}`)}
        </Button>
      ))}
    </div>
  );
}
