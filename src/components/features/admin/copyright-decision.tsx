'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { decideCopyrightClaimAction } from '@/server/actions/admin-panel';

import { useReauth } from './reauth';

export function CopyrightDecision({ claimId, hasNote }: { claimId: string; hasNote: boolean }) {
  const t = useTranslations('admin.copyright');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const reauth = useReauth();
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();
  const decide = (decision: 'accepted' | 'rejected') =>
    startTransition(async () => {
      const result = await reauth(() => decideCopyrightClaimAction({ claimId, decision, note }));
      if (result.ok) {
        toast({ title: t(`done.${decision}`), tone: 'success' });
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
    <div className="flex flex-col gap-3">
      <Field label={t('decisionNote')} description={t('decisionHint')}>
        <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="danger"
          loading={pending}
          disabled={!hasNote || note.trim().length < 5}
          onClick={() => decide('accepted')}
        >
          {t('accept')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          disabled={note.trim().length < 5}
          onClick={() => decide('rejected')}
        >
          {t('reject')}
        </Button>
      </div>
    </div>
  );
}
