'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { decidePayoutAction, revealPayoutDetailsAction } from '@/server/actions/admin';

export function PayoutDecision({ payoutId, status }: { payoutId: string; status: string }) {
  const t = useTranslations('admin.payouts');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState<{ holder: string; account: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (input: Parameters<typeof decidePayoutAction>[0], success: string) =>
    startTransition(async () => {
      const result = await decidePayoutAction(input);
      if (result.ok) {
        toast({ title: success, tone: 'success' });
        router.refresh();
      } else
        toast({
          title: tAll(
            Object.values(result.error.fieldErrors ?? {})[0]?.[0] ?? result.error.messageKey,
          ),
          tone: 'error',
        });
    });
  return (
    <div className="flex flex-col gap-2 text-sm">
      {details ? (
        <p className="font-mono">
          {details.holder}, {details.account}
        </p>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() =>
            startTransition(async () => {
              const result = await revealPayoutDetailsAction({ payoutId });
              if (result.ok) setDetails(result.value);
            })
          }
        >
          {t('reveal')}
        </Button>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {status === 'requested' ? (
          <Button
            size="sm"
            loading={pending}
            onClick={() => run({ payoutId, kind: 'approve' }, t('approved'))}
          >
            {t('approve')}
          </Button>
        ) : null}
        {status === 'approved' || status === 'processing' ? (
          <>
            <label className="flex flex-col gap-1">
              <span>{t('reference')}</span>
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className="min-h-9"
              />
            </label>
            <Button
              size="sm"
              loading={pending}
              onClick={() => run({ payoutId, kind: 'paid', bankReference: reference }, t('paid'))}
            >
              {t('markPaid')}
            </Button>
          </>
        ) : null}
        <label className="flex flex-col gap-1">
          <span>{t('reason')}</span>
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="min-h-9"
          />
        </label>
        <Button
          size="sm"
          variant="danger"
          loading={pending}
          onClick={() => run({ payoutId, kind: 'reject', reason }, t('rejected'))}
        >
          {t('reject')}
        </Button>
      </div>
    </div>
  );
}
