'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { resolveReportAdminAction } from '@/server/actions/admin-panel';

const TEMPLATES = [
  'abuse',
  'spam',
  'plagiarism',
  'examMaterial',
  'personalData',
  'noViolation',
] as const;

/** Resolve (optionally removing the content or banning its author) or dismiss, with templates. */
export function ReportResolution({
  reportId,
  canRemove,
  canBan,
}: {
  reportId: string;
  canRemove: boolean;
  canBan: boolean;
}) {
  const t = useTranslations('admin.reports');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [action, setAction] = useState<'none' | 'remove_content' | 'ban_user'>(
    canRemove ? 'remove_content' : 'none',
  );
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const submit = (resolution: 'resolved' | 'dismissed') =>
    startTransition(async () => {
      const result = await resolveReportAdminAction({
        reportId,
        resolution,
        action: resolution === 'dismissed' ? 'none' : action,
        note: note || undefined,
      });
      if (result.ok) {
        toast({
          title: resolution === 'resolved' ? t('resolvedToast') : t('dismissedToast'),
          tone: 'success',
        });
        router.refresh();
      } else toast({ title: tAll(result.error.messageKey), tone: 'error' });
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('action')}>
          <Select
            value={action}
            onChange={(event) => setAction(event.target.value as typeof action)}
          >
            <option value="none">{t('actions.none')}</option>
            {canRemove ? (
              <option value="remove_content">{t('actions.remove_content')}</option>
            ) : null}
            {canBan ? <option value="ban_user">{t('actions.ban_user')}</option> : null}
          </Select>
        </Field>
        <Field label={t('template')}>
          <Select
            value=""
            onChange={(event) =>
              event.target.value &&
              setNote(t(`templates.${event.target.value as (typeof TEMPLATES)[number]}`))
            }
          >
            <option value="">{t('chooseTemplate')}</option>
            {TEMPLATES.map((key) => (
              <option key={key} value={key}>
                {t(`templateNames.${key}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label={t('note')} description={t('noteHint')}>
        <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button size="sm" loading={pending} onClick={() => submit('resolved')}>
          {t('resolve')}
        </Button>
        <Button size="sm" variant="secondary" loading={pending} onClick={() => submit('dismissed')}>
          {t('dismiss')}
        </Button>
      </div>
    </div>
  );
}
