'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { accountSchema, type AccountInput } from '@/lib/validation/account';
import { updateAccountAction } from '@/server/actions/account';

export function AccountForm({ defaults, email }: { defaults: AccountInput; email: string }) {
  const t = useTranslations('settings.account');
  const router = useRouter();
  const { toast } = useToast();
  const { form, formError, onSubmit, fieldError } = useActionForm({
    schema: accountSchema,
    action: updateAccountAction,
    defaultValues: defaults,
    onSuccess: () => {
      toast({ title: t('saved'), tone: 'success' });
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-lg flex-col gap-4">
      <FormAlert message={formError} />
      <Field label={t('name')} error={fieldError('name')} required>
        <Input autoComplete="name" {...form.register('name')} />
      </Field>
      <Field
        label={t('username')}
        description={t('usernameHint')}
        error={fieldError('username')}
        required
      >
        <Input
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          {...form.register('username')}
        />
      </Field>
      <Field label={t('bio')} description={t('bioHint')} error={fieldError('bio')}>
        <Textarea rows={3} maxLength={300} {...form.register('bio')} />
      </Field>
      <Field label={t('email')} description={t('emailHint')}>
        <Input value={email} readOnly disabled />
      </Field>
      <Button type="submit" className="self-start" loading={form.formState.isSubmitting}>
        {t('save')}
      </Button>
    </form>
  );
}
