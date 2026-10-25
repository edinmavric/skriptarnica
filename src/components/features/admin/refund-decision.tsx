'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

import { useReauth } from './reauth';
import { decideRefundAction } from '@/server/actions/admin';

export function RefundDecision({ refundId }: { refundId: string }) {
  const t = useTranslations('admin.refunds');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const reauth = useReauth();
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const decide = (approve: boolean) =>
    startTransition(async () => {
      const result = await reauth(() =>
        decideRefundAction({ refundId, approve, note: note || null }),
      );
      if (result.ok) {
        toast({ title: approve ? t('approved') : t('rejected'), tone: 'success' });
        router.refresh();
      } else toast({ title: tAll(result.error.messageKey), tone: 'error' });
    });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('note')}</span>
        <Input value={note} onChange={(event) => setNote(event.target.value)} className="min-h-9" />
      </label>
      <Button size="sm" loading={pending} onClick={() => decide(true)}>
        {t('approve')}
      </Button>
      <Button size="sm" variant="secondary" loading={pending} onClick={() => decide(false)}>
        {t('reject')}
      </Button>
    </div>
  );
}
