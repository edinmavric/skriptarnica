'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { Turnstile } from '@/components/forms/turnstile';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { routes } from '@/config/routes';
import { signUpSchema } from '@/lib/validation/auth';
import { signUpAction } from '@/server/auth/actions';

export function SignUpForm({ siteKey, nonce }: { siteKey: string; nonce: string | undefined }) {
  const t = useTranslations('auth.signUp');
  const router = useRouter();
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: signUpSchema,
    action: signUpAction,
    defaultValues: {
      name: '',
      username: '',
      email: '',
      password: '',
      acceptTerms: false as unknown as true,
      confirmAge: false as unknown as true,
      marketingEmails: false,
      turnstileToken: '',
    },
    onSuccess: ({ email }) =>
      router.push(`${routes.verifyEmailPending}?email=${encodeURIComponent(email)}`),
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
      <Field label={t('email')} error={fieldError('email')} required>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
      </Field>
      <Field
        label={t('password')}
        description={t('passwordHint')}
        error={fieldError('password')}
        required
      >
        <Input type="password" autoComplete="new-password" {...form.register('password')} />
      </Field>
      <Controller
        control={form.control}
        name="acceptTerms"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            onBlur={field.onBlur}
            ref={field.ref}
            error={fieldError('acceptTerms')}
            label={t.rich('acceptTerms', {
              terms: (chunks) => (
                <Link
                  href={routes.legal.terms}
                  className="text-pen underline underline-offset-2"
                  target="_blank"
                >
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link
                  href={routes.legal.privacy}
                  className="text-pen underline underline-offset-2"
                  target="_blank"
                >
                  {chunks}
                </Link>
              ),
            })}
          />
        )}
      />
      <Controller
        control={form.control}
        name="confirmAge"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            onBlur={field.onBlur}
            ref={field.ref}
            error={fieldError('confirmAge')}
            label={t('confirmAge')}
          />
        )}
      />
      <Controller
        control={form.control}
        name="marketingEmails"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            label={t('marketing')}
          />
        )}
      />
      <Controller
        control={form.control}
        name="turnstileToken"
        render={({ field }) => (
          <Turnstile
            siteKey={siteKey}
            nonce={nonce}
            action="sign-up"
            onToken={field.onChange}
            error={fieldError('turnstileToken')}
          />
        )}
      />
      <Button type="submit" size="lg" loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
