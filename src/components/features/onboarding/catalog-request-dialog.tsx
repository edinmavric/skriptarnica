'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { catalogRequestSchema } from '@/lib/validation/onboarding';
import { catalogRequestAction } from '@/server/actions/onboarding';

/** "Ne vidiš svoj smer?" → suggest a missing catalog entry for admin review (SPEC §4.1). */
export function CatalogRequestDialog({
  universityId,
  facultyId,
  defaultType = 'program',
}: {
  universityId?: string | null;
  facultyId?: string | null;
  defaultType?: 'university' | 'faculty' | 'program' | 'course' | 'professor';
}) {
  const t = useTranslations('onboarding.catalogRequest');
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: catalogRequestSchema,
    action: catalogRequestAction,
    defaultValues: {
      type: defaultType,
      name: '',
      note: '',
      ...(universityId ? { universityId } : {}),
      ...(facultyId ? { facultyId } : {}),
    },
    onSuccess: () => setSent(true),
  });
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
        <Button variant="link" className="self-start">
          {t('trigger')}
        </Button>
      }
      title={t('title')}
      description={t('description')}
    >
      {sent ? (
        <FormAlert tone="success" message={t('sent')} />
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <FormAlert message={formError} />
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Field label={t('type')}>
                <Select
                  value={field.value}
                  onChange={(event) => field.onChange(event.target.value)}
                >
                  {(['university', 'faculty', 'program', 'course', 'professor'] as const).map(
                    (type) => (
                      <option key={type} value={type}>
                        {t(`types.${type}`)}
                      </option>
                    ),
                  )}
                </Select>
              </Field>
            )}
          />
          <Field label={t('name')} error={fieldError('name')}>
            <Input {...form.register('name')} />
          </Field>
          <Field label={t('note')} description={t('noteHint')}>
            <Textarea rows={3} {...form.register('note')} />
          </Field>
          <Button type="submit" loading={submitting}>
            {t('submit')}
          </Button>
        </form>
      )}
    </Dialog>
  );
}
