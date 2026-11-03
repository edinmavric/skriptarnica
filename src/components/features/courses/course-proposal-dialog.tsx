'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { courseProposalSchema } from '@/lib/validation/onboarding';
import { proposeCourseAction } from '@/server/actions/onboarding';

export interface CourseProposalTarget {
  programName: string;
  facultyShortName: string;
  durationYears: number;
  year: number | null;
}

/**
 * "Ne vidiš predmet?" → the student proposes a course for their own program; an admin approves it
 * and it then appears in their list. Without a program there's nothing to attach it to.
 */
export function CourseProposalDialog({
  target,
  trigger = 'link',
}: {
  target: CourseProposalTarget;
  trigger?: 'link' | 'button';
}) {
  const t = useTranslations('courseProposal');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: courseProposalSchema,
    action: proposeCourseAction,
    defaultValues: {
      name: '',
      code: '',
      year: Math.min(target.year ?? 1, target.durationYears),
      term: 'winter',
      note: '',
    },
    onSuccess: () => {
      setSent(true);
      router.refresh();
    },
  });
  const years = Array.from({ length: target.durationYears }, (_, i) => i + 1);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSent(false);
          form.reset();
        }
      }}
      trigger={
        trigger === 'button' ? (
          <Button variant="secondary" className="self-start">
            {t('triggerButton')}
          </Button>
        ) : (
          <Button variant="link" className="self-start">
            {t('trigger')}
          </Button>
        )
      }
      title={t('title')}
      description={t('description', {
        program: target.programName,
        faculty: target.facultyShortName,
      })}
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <FormAlert tone="success" message={t('sent')} />
          <Button variant="secondary" className="self-start" onClick={() => setOpen(false)}>
            {t('close')}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormAlert message={formError} />
          <Field label={t('name')} error={fieldError('name')}>
            <Input autoComplete="off" {...form.register('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('year')} error={fieldError('year')}>
              <Select {...form.register('year')}>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {t('yearOption', { year })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('term')} error={fieldError('term')}>
              <Select {...form.register('term')}>
                <option value="winter">{t('terms.winter')}</option>
                <option value="summer">{t('terms.summer')}</option>
              </Select>
            </Field>
          </div>
          <Field label={t('code')} description={t('codeHint')} error={fieldError('code')}>
            <Input autoComplete="off" {...form.register('code')} />
          </Field>
          <Field label={t('note')} description={t('noteHint')} error={fieldError('note')}>
            <Textarea rows={3} {...form.register('note')} />
          </Field>
          <Button type="submit" loading={submitting} className="self-start">
            {t('submit')}
          </Button>
        </form>
      )}
    </Dialog>
  );
}
