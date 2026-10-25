'use client';

import { useTranslations } from 'next-intl';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { changePasswordSchema } from '@/lib/validation/account';
import { changePasswordAction } from '@/server/actions/account';
import { useState } from 'react';

export function PasswordForm() {
  const t = useTranslations('settings.password');
  const [done, setDone] = useState(false);
  const { form, formError, onSubmit, fieldError, submitting } = useActionForm({
    schema: changePasswordSchema,
    action: changePasswordAction,
    defaultValues: { currentPassword: '', newPassword: '' },
    onSuccess: () => {
      setDone(true);
      form.reset();
    },
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-lg flex-col gap-4">
      <FormAlert message={formError} />
      {done ? <FormAlert tone="success" message={t('changed')} /> : null}
      <Field label={t('current')} error={fieldError('currentPassword')} required>
        <Input
          type="password"
          autoComplete="current-password"
          {...form.register('currentPassword')}
        />
      </Field>
      <Field label={t('new')} description={t('newHint')} error={fieldError('newPassword')} required>
        <Input type="password" autoComplete="new-password" {...form.register('newPassword')} />
      </Field>
      <Button type="submit" className="self-start" loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
