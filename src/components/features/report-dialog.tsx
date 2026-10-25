'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { FlagIcon } from '@/components/ui/icons';
import { Textarea } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import type { ReportInput } from '@/lib/validation/reports';
import { reportAction } from '@/server/actions/reports';

const reasons = ['spam', 'abuse', 'plagiarism', 'exam_material', 'personal_data', 'other'] as const;

/** Report anything (notes, reviews, posts, comments, users, communities). */
export function ReportDialog({
  targetType,
  targetId,
  compact,
}: {
  targetType: ReportInput['targetType'];
  targetId: string;
  compact?: boolean;
}) {
  const t = useTranslations('reports');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reasons)[number]>('spam');
  const [text, setText] = useState('');
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setState(null);
      }}
      trigger={
        <Button variant="ghost" size={compact ? 'sm' : 'md'}>
          <FlagIcon /> {t('trigger')}
        </Button>
      }
      title={t('title')}
      description={t('description')}
    >
      {state?.ok ? (
        <FormAlert tone="success" message={state.message} />
      ) : (
        <div className="flex flex-col gap-4">
          <FormAlert message={state?.message ?? null} />
          <RadioGroup
            legend={t('reasonLegend')}
            value={reason}
            onValueChange={(value) => setReason(value as (typeof reasons)[number])}
            options={reasons.map((value) => ({ value, label: t(`reasons.${value}`) }))}
          />
          <Field
            label={t('details')}
            description={reason === 'plagiarism' ? t('copyrightHint') : undefined}
          >
            <Textarea
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={1000}
            />
          </Field>
          <Button
            loading={pending}
            className="self-start"
            onClick={() =>
              startTransition(async () => {
                const result = await reportAction({
                  targetType,
                  targetId,
                  reason,
                  ...(text.trim() ? { text } : {}),
                });
                setState(
                  result.ok
                    ? { ok: true, message: t('sent') }
                    : { ok: false, message: tAll(result.error.messageKey) },
                );
              })
            }
          >
            {t('submit')}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
