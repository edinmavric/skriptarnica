'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Controller } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { routes } from '@/config/routes';
import { becomeSellerSchema } from '@/lib/validation/seller';
import { becomeSellerAction } from '@/server/actions/sellers';

export function BecomeSellerForm() {
  const t = useTranslations('seller.become');
  const router = useRouter();
  const { form, onSubmit, formError, fieldError, submitting } = useActionForm({
    schema: becomeSellerSchema,
    action: becomeSellerAction,
    defaultValues: {
      confirmAdult: false as unknown as true,
      acceptSellerTerms: false as unknown as true,
      accountHolder: '',
      accountNumber: '',
    },
    onSuccess: () => {
      router.push(routes.sellNew);
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-lg flex-col gap-5">
      <FormAlert message={formError} />
      <Controller
        control={form.control}
        name="confirmAdult"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(c) => field.onChange(c === true)}
            ref={field.ref}
            error={fieldError('confirmAdult')}
            label={t('confirmAdult')}
          />
        )}
      />
      <fieldset className="flex flex-col gap-4 rounded-md border border-rule p-4">
        <legend className="px-1 text-sm font-semibold">{t('payoutLegend')}</legend>
        <p className="text-sm text-ink-muted">{t('payoutIntro')}</p>
        <Field label={t('accountHolder')} error={fieldError('accountHolder')} required>
          <Input autoComplete="name" {...form.register('accountHolder')} />
        </Field>
        <Field
          label={t('accountNumber')}
          description={t('accountNumberHint')}
          error={fieldError('accountNumber')}
          required
        >
          <Input
            inputMode="numeric"
            placeholder="160-0000000012345-67"
            {...form.register('accountNumber')}
          />
        </Field>
      </fieldset>
      <Controller
        control={form.control}
        name="acceptSellerTerms"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(c) => field.onChange(c === true)}
            ref={field.ref}
            error={fieldError('acceptSellerTerms')}
            label={t.rich('acceptTerms', {
              link: (chunks) => (
                <Link
                  href={routes.legal.seller}
                  target="_blank"
                  className="text-pen underline underline-offset-2"
                >
                  {chunks}
                </Link>
              ),
            })}
          />
        )}
      />
      <Button type="submit" size="lg" loading={submitting} className="self-start">
        {t('submit')}
      </Button>
    </form>
  );
}
