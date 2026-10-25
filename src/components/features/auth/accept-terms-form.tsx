'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { routes } from '@/config/routes';
import { acceptTermsSchema } from '@/lib/validation/auth';
import { acceptTermsAction } from '@/server/auth/actions';

export function AcceptTermsForm({ next }: { next: string }) {
  const t = useTranslations('auth.acceptTerms');
  const tSignUp = useTranslations('auth.signUp');
  const router = useRouter();
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: acceptTermsSchema,
    action: acceptTermsAction,
    defaultValues: {
      acceptTerms: false as unknown as true,
      confirmAge: false as unknown as true,
      next,
    },
    onSuccess: ({ redirectTo }) => {
      router.push(redirectTo);
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <FormAlert message={formError} />
      <Controller
        control={form.control}
        name="acceptTerms"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            ref={field.ref}
            error={fieldError('acceptTerms')}
            label={tSignUp.rich('acceptTerms', {
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
            ref={field.ref}
            error={fieldError('confirmAge')}
            label={tSignUp('confirmAge')}
          />
        )}
      />
      <Button type="submit" size="lg" loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
