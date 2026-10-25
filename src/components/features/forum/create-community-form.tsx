'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { Select } from '@/components/ui/select';
import { routes } from '@/config/routes';
import { createCommunitySchema } from '@/lib/validation/forum';
import { createCommunityAction } from '@/server/actions/forum';

export function CreateCommunityForm({
  professors,
  hasFaculty,
}: {
  professors: { id: string; name: string }[];
  hasFaculty: boolean;
}) {
  const t = useTranslations('forum.create');
  const router = useRouter();
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: createCommunitySchema,
    action: createCommunityAction,
    defaultValues: {
      type: 'general',
      name: '',
      description: '',
      rules: '',
      visibility: 'public',
      professorId: null,
    },
    onSuccess: ({ slug }) => router.push(routes.community(slug)),
  });
  const type = form.watch('type');
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-5">
      <FormAlert message={formError} />
      <Controller
        control={form.control}
        name="type"
        render={({ field }) => (
          <RadioGroup
            legend={t('type')}
            value={field.value}
            onValueChange={field.onChange}
            options={(['general', 'professor', 'exam'] as const).map((value) => ({
              value,
              label: t(`types.${value}`),
              description: t(`typeHints.${value}`),
            }))}
          />
        )}
      />
      {type === 'professor' ? (
        <Controller
          control={form.control}
          name="professorId"
          render={({ field }) => (
            <Field label={t('professor')} description={t('professorHint')}>
              <Select
                value={field.value ?? ''}
                onChange={(event) => field.onChange(event.target.value || null)}
              >
                <option value="">{t('professorNone')}</option>
                {professors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        />
      ) : null}
      <Field label={t('name')} error={fieldError('name')} required>
        <Input {...form.register('name')} maxLength={60} />
      </Field>
      <Field label={t('description')} error={fieldError('description')} required>
        <Textarea rows={3} {...form.register('description')} />
      </Field>
      <Field label={t('rules')} description={t('rulesHint')}>
        <Textarea rows={5} {...form.register('rules')} />
      </Field>
      <Controller
        control={form.control}
        name="visibility"
        render={({ field }) => (
          <RadioGroup
            legend={t('visibility')}
            value={field.value}
            onValueChange={field.onChange}
            options={[
              { value: 'public', label: t('public'), description: t('publicHint') },
              {
                value: 'faculty_only',
                label: t('facultyOnly'),
                description: hasFaculty ? t('facultyOnlyHint') : t('facultyOnlyNeedsFaculty'),
                disabled: !hasFaculty,
              },
            ]}
          />
        )}
      />
      <Button type="submit" size="lg" loading={submitting} className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}
