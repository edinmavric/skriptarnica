'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { twoFactorSchema } from '@/lib/validation/auth';
import { verifyTwoFactorAction } from '@/server/auth/actions';

export function TwoFactorForm({ next }: { next: string }) {
  const t = useTranslations('auth.twoFactor');
  const router = useRouter();
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: twoFactorSchema,
    action: verifyTwoFactorAction,
    defaultValues: { code: '', trustDevice: false, next },
    onSuccess: ({ redirectTo }) => {
      router.push(redirectTo);
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert message={formError} />
      <Field label={t('code')} description={t('codeHint')} error={fieldError('code')}>
        <Input
          autoComplete="one-time-code"
          inputMode="numeric"
          autoFocus
          {...form.register('code')}
        />
      </Field>
      <Controller
        control={form.control}
        name="trustDevice"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            label={t('trustDevice')}
          />
        )}
      />
      <Button type="submit" size="lg" loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
