'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { cancelDeletionAction, requestDeletionAction } from '@/server/actions/account';

export function CancelDeletionButton() {
  const t = useTranslations('settings.data.delete');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      className="self-start"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await cancelDeletionAction({});
          router.refresh();
        })
      }
    >
      {t('cancel')}
    </Button>
  );
}

/** Deletion request: content choice, balance waiver when needed, password (or an email link). */
export function AccountDeletionForm({
  hasPassword,
  balance,
  openPayout,
}: {
  hasPassword: boolean;
  /** Formatted unpaid balance, or null when there is none. */
  balance: string | null;
  openPayout: boolean;
}) {
  const t = useTranslations('settings.data.delete');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<'keep' | 'delete'>('keep');
  const [waive, setWaive] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [pending, startTransition] = useTransition();

  if (openPayout) return <FormAlert message={t('openPayout')} />;
  if (emailSent) return <FormAlert tone="success" message={t('emailSent')} />;

  const blocked = Boolean(balance) && !waive;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        setError(null);
      }}
      trigger={
        <Button variant="danger" className="self-start">
          {t('start')}
        </Button>
      }
      title={t('dialogTitle')}
      description={t('dialogDescription')}
      footer={
        <Button
          variant="danger"
          loading={pending}
          disabled={blocked || (hasPassword && !password)}
          onClick={() =>
            startTransition(async () => {
              const result = await requestDeletionAction({
                password: hasPassword ? password : undefined,
                deleteContent: content === 'delete',
                waiveBalance: waive,
              });
              if (!result.ok) {
                setError(tAll(result.error.fieldErrors?.password?.[0] ?? result.error.messageKey));
                return;
              }
              setOpen(false);
              if (result.value.emailSent) setEmailSent(true);
              else router.refresh();
            })
          }
        >
          {hasPassword ? t('confirm') : t('sendEmail')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={error} />
        <RadioGroup
          legend={t('contentLegend')}
          value={content}
          onValueChange={(value) => setContent(value as 'keep' | 'delete')}
          options={[
            { value: 'keep', label: t('contentKeep'), description: t('contentKeepHint') },
            { value: 'delete', label: t('contentDelete'), description: t('contentDeleteHint') },
          ]}
        />
        {balance ? (
          <div className="flex flex-col gap-2 rounded-md bg-warning-soft p-3">
            <p className="text-sm">{t('balance', { amount: balance })}</p>
            <Checkbox
              checked={waive}
              onCheckedChange={(value) => setWaive(value === true)}
              label={t('waive', { amount: balance })}
            />
          </div>
        ) : null}
        {hasPassword ? (
          <Field label={t('password')} required>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
        ) : (
          <p className="text-sm text-ink-muted">{t('noPassword')}</p>
        )}
      </div>
    </Dialog>
  );
}
