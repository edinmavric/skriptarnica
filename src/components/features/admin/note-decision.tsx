'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { approveNoteAction, rejectNoteAction } from '@/server/actions/admin';

export function NoteDecision({ noteId }: { noteId: string }) {
  const t = useTranslations('admin.review');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (
    fn: () => Promise<{
      ok: boolean;
      error?: { messageKey: string; fieldErrors?: Record<string, string[]> };
    }>,
    success: string,
  ) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast({ title: success, tone: 'success' });
        router.push('/admin/skripte');
        router.refresh();
      } else
        setMessage({
          tone: 'error',
          text: tAll(
            result.error?.fieldErrors?.reason?.[0] ?? result.error?.messageKey ?? 'errors.internal',
          ),
        });
    });
  return (
    <div className="flex flex-col gap-3 rounded-md border border-rule p-4">
      <FormAlert tone={message?.tone ?? 'error'} message={message?.text ?? null} />
      <Button
        loading={pending}
        onClick={() => run(() => approveNoteAction({ noteId }), t('approved'))}
      >
        {t('approve')}
      </Button>
      <Field label={t('reason')} description={t('reasonHint')}>
        <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <Button
        variant="danger"
        loading={pending}
        onClick={() => run(() => rejectNoteAction({ noteId, reason }), t('rejected'))}
      >
        {t('reject')}
      </Button>
    </div>
  );
}
