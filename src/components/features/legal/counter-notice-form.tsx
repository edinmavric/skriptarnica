'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { counterNoticeSchema } from '@/lib/validation/copyright';
import { submitCounterNoticeAction } from '@/server/actions/copyright';

export function CounterNoticeForm({ noteId }: { noteId: string }) {
  const t = useTranslations('copyrightForm.counter');
  const router = useRouter();
  const { form, formError, onSubmit, fieldError, submitting } = useActionForm({
    schema: counterNoticeSchema,
    action: submitCounterNoticeAction,
    defaultValues: { noteId, text: '', statement: false as unknown as true },
    onSuccess: () => router.refresh(),
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-4">
      <FormAlert message={formError} />
      <Field label={t('text')} description={t('textHint')} error={fieldError('text')} required>
        <Textarea rows={8} {...form.register('text')} />
      </Field>
      <Controller
        control={form.control}
        name="statement"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(value) => field.onChange(value === true)}
            label={t('statement')}
            error={fieldError('statement')}
          />
        )}
      />
      <Button type="submit" className="self-start" loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
