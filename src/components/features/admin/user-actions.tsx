'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { Result } from '@/lib/result';
import {
  adjustBalanceAction,
  banUserAction,
  resetTwoFactorAction,
  startImpersonationAction,
  unbanUserAction,
} from '@/server/actions/admin-panel';

import { useReauth } from './reauth';

function useRun() {
  const reauth = useReauth();
  const router = useRouter();
  const { toast } = useToast();
  const tAll = useTranslations() as unknown as (key: string) => string;
  const [pending, startTransition] = useTransition();
  const run = <T,>(action: () => Promise<Result<T>>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await reauth(action);
      if (result.ok) {
        toast({ title: success, tone: 'success' });
        after?.();
        router.refresh();
      } else
        toast({
          title: tAll(
            Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.messageKey,
          ),
          tone: 'error',
        });
    });
  return { run, pending };
}

export function UserActions({
  userId,
  banned,
  twoFactor,
  isAdmin,
  deleted,
}: {
  userId: string;
  banned: boolean;
  twoFactor: boolean;
  isAdmin: boolean;
  deleted: boolean;
}) {
  const t = useTranslations('admin.users.actions');
  const { run, pending } = useRun();
  const [banOpen, setBanOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (deleted) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {!isAdmin ? (
        banned ? (
          <Button
            variant="secondary"
            loading={pending}
            onClick={() => run(() => unbanUserAction({ userId }), t('unbanned'))}
          >
            {t('unban')}
          </Button>
        ) : (
          <Dialog
            open={banOpen}
            onOpenChange={setBanOpen}
            trigger={<Button variant="danger">{t('ban')}</Button>}
            title={t('banTitle')}
            description={t('banDescription')}
            footer={
              <Button
                variant="danger"
                loading={pending}
                disabled={reason.trim().length < 5}
                onClick={() =>
                  run(
                    () => banUserAction({ userId, reason }),
                    t('banned'),
                    () => setBanOpen(false),
                  )
                }
              >
                {t('banConfirm')}
              </Button>
            }
          >
            <Field label={t('reason')} required>
              <Textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </Dialog>
        )
      ) : null}
      {twoFactor && !isAdmin ? (
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => run(() => resetTwoFactorAction({ userId }), t('twoFactorReset'))}
        >
          {t('resetTwoFactor')}
        </Button>
      ) : null}
      {!isAdmin && !banned ? (
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => run(() => startImpersonationAction({ userId }), t('impersonating'))}
        >
          {t('impersonate')}
        </Button>
      ) : null}
    </div>
  );
}

/** Manual ledger adjustment: reason + amount typed twice + re-authentication (SPEC §4.10). */
export function AdjustmentForm({ sellerId }: { sellerId: string }) {
  const t = useTranslations('admin.users.adjustment');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const { run, pending } = useRun();
  const [amount, setAmount] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reason, setReason] = useState('');
  const toPara = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);
  const valid = amount !== '' && Number.isFinite(toPara(amount)) && toPara(amount) !== 0;
  const mismatch = confirm !== '' && toPara(confirm) !== toPara(amount);
  return (
    <div className="flex max-w-lg flex-col gap-3">
      <Field label={t('amount')} description={t('amountHint')} required>
        <Input
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </Field>
      <Field
        label={t('confirm')}
        error={mismatch ? tAll('validation.amountMismatch') : undefined}
        required
      >
        <Input
          inputMode="decimal"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
      </Field>
      <Field label={t('reason')} description={t('reasonHint')} required>
        <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <FormAlert message={null} />
      <Button
        className="self-start"
        loading={pending}
        disabled={!valid || mismatch || confirm === '' || reason.trim().length < 10}
        onClick={() =>
          run(
            () =>
              adjustBalanceAction({
                sellerId,
                amountPara: toPara(amount),
                confirmAmountPara: toPara(confirm),
                reason,
              }),
            t('done'),
            () => {
              setAmount('');
              setConfirm('');
              setReason('');
            },
          )
        }
      >
        {t('submit')}
      </Button>
    </div>
  );
}
