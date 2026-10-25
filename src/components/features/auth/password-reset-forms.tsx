'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { routes } from '@/config/routes';
import { forgotPasswordSchema, resetPasswordSchema } from '@/lib/validation/auth';
import { forgotPasswordAction, resetPasswordAction } from '@/server/auth/actions';

export function ForgotPasswordForm() {
  const t = useTranslations('auth.forgot');
  const [sent, setSent] = useState(false);
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: forgotPasswordSchema,
    action: forgotPasswordAction,
    defaultValues: { email: '' },
    onSuccess: () => setSent(true),
  });
  if (sent) return <FormAlert tone="success" message={t('sent')} />;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert message={formError} />
      <Field label={t('email')} error={fieldError('email')}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
      </Field>
      <Button type="submit" size="lg" loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations('auth.reset');
  const [done, setDone] = useState(false);
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: resetPasswordSchema,
    action: resetPasswordAction,
    defaultValues: { token, password: '', confirmPassword: '' },
    onSuccess: () => setDone(true),
  });
  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success" message={t('done')} />
        <Button asChild size="lg">
          <Link href={routes.signIn}>{t('toSignIn')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert message={formError} />
      <Field label={t('password')} description={t('passwordHint')} error={fieldError('password')}>
        <Input type="password" autoComplete="new-password" {...form.register('password')} />
      </Field>
      <Field label={t('confirm')} error={fieldError('confirmPassword')}>
        <Input type="password" autoComplete="new-password" {...form.register('confirmPassword')} />
      </Field>
      <Button type="submit" size="lg" loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
