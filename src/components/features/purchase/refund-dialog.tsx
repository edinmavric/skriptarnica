'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { requestRefundAction } from '@/server/actions/purchase';

const reasons = ['not_as_described', 'corrupted', 'empty', 'plagiarism', 'other'] as const;

/** "Prijavi problem" within the purchase window (SPEC §4.3); an admin decides. */
export function RefundDialog({ orderId, days }: { orderId: string; days: number }) {
  const t = useTranslations('library.refund');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reasons)[number]>('not_as_described');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="ghost" size="sm">
          {t('trigger')}
        </Button>
      }
      title={t('title')}
      description={t('description', { days })}
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={error} />
        <RadioGroup
          legend={t('reason')}
          value={reason}
          onValueChange={(value) => setReason(value as (typeof reasons)[number])}
          options={reasons.map((value) => ({ value, label: t(`reasons.${value}`) }))}
        />
        <Field label={t('details')} error={textError}>
          <Textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} />
        </Field>
        <Button
          loading={pending}
          className="self-start"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await requestRefundAction({ orderId, reason, text });
              if (result.ok) {
                setOpen(false);
                router.refresh();
                return;
              }
              if (result.error.fieldErrors?.text?.[0])
                setTextError(tAll(result.error.fieldErrors.text[0]));
              else setError(tAll(result.error.messageKey));
            })
          }
        >
          {t('submit')}
        </Button>
      </div>
    </Dialog>
  );
}
