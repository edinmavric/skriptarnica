'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { replyToReviewAction } from '@/server/actions/purchase';

export function ReviewReply({ reviewId }: { reviewId: string }) {
  const t = useTranslations('notes.reviews');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button variant="link" size="sm" onClick={() => setOpen(true)}>
        {t('reply')}
      </Button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <Field label={t('replyLabel')} description={t('replyHint')} error={error}>
        <Textarea rows={3} value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
      <Button
        size="sm"
        className="self-start"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await replyToReviewAction({ reviewId, text });
            if (result.ok) router.refresh();
            else setError(tAll(result.error.fieldErrors?.text?.[0] ?? result.error.messageKey));
          })
        }
      >
        {t('sendReply')}
      </Button>
    </div>
  );
}
