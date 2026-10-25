'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { StarIcon } from '@/components/ui/icons';
import { Textarea } from '@/components/ui/input';
import { RatingInput } from '@/components/ui/rating-stars';
import { Select } from '@/components/ui/select';
import { createReviewAction } from '@/server/actions/purchase';

export function ReviewDialog({ orderId, title }: { orderId: string; title: string }) {
  const t = useTranslations('library.review');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [grade, setGrade] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant="secondary" size="sm">
          <StarIcon /> {t('trigger')}
        </Button>
      }
      title={t('title')}
      description={title}
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={formError} />
        <RatingInput
          name={`rating-${orderId}`}
          legend={t('rating')}
          value={rating}
          onChange={setRating}
          error={errors.rating}
        />
        <Field label={t('text')} description={t('textHint')} error={errors.text}>
          <Textarea
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={2000}
          />
        </Field>
        <Field label={t('passed')} description={t('passedHint')}>
          <Select value={grade} onChange={(event) => setGrade(event.target.value)}>
            <option value="">{t('passedNone')}</option>
            {[6, 7, 8, 9, 10].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          loading={pending}
          className="self-start"
          onClick={() =>
            startTransition(async () => {
              setFormError(null);
              if (!rating) {
                setErrors({ rating: tAll('validation.ratingRequired') });
                return;
              }
              const result = await createReviewAction({
                orderId,
                rating,
                text,
                passedGrade: grade ? Number(grade) : null,
              });
              if (result.ok) {
                setOpen(false);
                router.refresh();
                return;
              }
              const fieldErrors = Object.fromEntries(
                Object.entries(result.error.fieldErrors ?? {}).map(([k, v]) => [
                  k,
                  tAll(v[0] ?? ''),
                ]),
              );
              setErrors(fieldErrors);
              if (Object.keys(fieldErrors).length === 0)
                setFormError(tAll(result.error.messageKey));
            })
          }
        >
          {t('submit')}
        </Button>
      </div>
    </Dialog>
  );
}
