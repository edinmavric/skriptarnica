'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { Turnstile } from '@/components/forms/turnstile';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { routes } from '@/config/routes';
import { authClient } from '@/lib/auth-client';
import { magicLinkSchema, signInSchema } from '@/lib/validation/auth';
import { magicLinkAction, signInAction } from '@/server/auth/actions';

function PasswordForm({ next }: { next: string }) {
  const t = useTranslations('auth.signIn');
  const router = useRouter();
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: signInSchema,
    action: signInAction,
    defaultValues: { email: '', password: '', next },
    onSuccess: ({ redirectTo }) => {
      router.push(redirectTo);
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert message={formError} />
      <Field label={t('email')} error={fieldError('email')}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
      </Field>
      <Field label={t('password')} error={fieldError('password')}>
        <Input type="password" autoComplete="current-password" {...form.register('password')} />
      </Field>
      <Link
        href={routes.forgotPassword}
        className="-mt-2 self-start text-sm text-pen hover:underline"
      >
        {t('forgot')}
      </Link>
      <Button type="submit" size="lg" loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}

function MagicLinkForm({
  next,
  siteKey,
  nonce,
}: {
  next: string;
  siteKey: string;
  nonce: string | undefined;
}) {
  const t = useTranslations('auth.signIn');
  const [sent, setSent] = useState(false);
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: magicLinkSchema,
    action: magicLinkAction,
    defaultValues: { email: '', turnstileToken: '', next },
    onSuccess: () => setSent(true),
  });
  if (sent) return <FormAlert tone="success" message={t('magicSent')} />;
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert message={formError} />
      <p className="text-ink-muted">{t('magicHint')}</p>
      <Field label={t('email')} error={fieldError('email')}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
      </Field>
      <Controller
        control={form.control}
        name="turnstileToken"
        render={({ field }) => (
          <Turnstile
            siteKey={siteKey}
            nonce={nonce}
            action="magic-link"
            onToken={field.onChange}
            error={fieldError('turnstileToken')}
          />
        )}
      />
      <Button type="submit" size="lg" loading={submitting}>
        {t('magicSubmit')}
      </Button>
    </form>
  );
}

export function SignInForm({
  next,
  googleEnabled,
  siteKey,
  nonce,
}: {
  next: string;
  googleEnabled: boolean;
  siteKey: string;
  nonce: string | undefined;
}) {
  const t = useTranslations('auth.signIn');
  const [googleLoading, setGoogleLoading] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      {googleEnabled ? (
        <>
          <Button
            variant="secondary"
            size="lg"
            loading={googleLoading}
            onClick={async () => {
              setGoogleLoading(true);
              await authClient.signIn.social({
                provider: 'google',
                callbackURL: next,
                newUserCallbackURL: routes.onboarding,
              });
            }}
          >
            {t('google')}
          </Button>
          <p className="text-center text-sm text-ink-muted">{t('or')}</p>
        </>
      ) : null}
      <Tabs defaultValue="password">
        <TabsList label={t('methods')}>
          <TabsTrigger value="password">{t('withPassword')}</TabsTrigger>
          <TabsTrigger value="magic">{t('withLink')}</TabsTrigger>
        </TabsList>
        <TabsContent value="password">
          <PasswordForm next={next} />
        </TabsContent>
        <TabsContent value="magic">
          <MagicLinkForm next={next} siteKey={siteKey} nonce={nonce} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
