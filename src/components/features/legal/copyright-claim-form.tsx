'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Controller } from 'react-hook-form';

import { FormAlert } from '@/components/forms/form-alert';
import { Turnstile } from '@/components/forms/turnstile';
import { useActionForm } from '@/components/forms/use-action-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { copyrightClaimSchema } from '@/lib/validation/copyright';
import { submitCopyrightClaimAction } from '@/server/actions/copyright';

export function CopyrightClaimForm({
  siteKey,
  nonce,
}: {
  siteKey: string;
  nonce: string | undefined;
}) {
  const t = useTranslations('copyrightForm');
  const [done, setDone] = useState<string | null>(null);
  const { form, formError, onSubmit, fieldError, submitting } = useActionForm({
    schema: copyrightClaimSchema,
    action: submitCopyrightClaimAction,
    defaultValues: {
      claimantName: '',
      claimantEmail: '',
      organization: '',
      contentUrl: '',
      ownershipProof: '',
      statement: false as unknown as true,
      turnstileToken: '',
    },
    onSuccess: (value) => setDone(value.id.slice(0, 8)),
  });
  if (done) return <FormAlert tone="success" message={t('sent', { reference: done })} />;
  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-4">
      <h2 className="text-display-sm font-semibold">{t('title')}</h2>
      <FormAlert message={formError} />
      <Field label={t('name')} error={fieldError('claimantName')} required>
        <Input autoComplete="name" {...form.register('claimantName')} />
      </Field>
      <Field label={t('email')} error={fieldError('claimantEmail')} required>
        <Input type="email" autoComplete="email" {...form.register('claimantEmail')} />
      </Field>
      <Field label={t('organization')} error={fieldError('organization')}>
        <Input autoComplete="organization" {...form.register('organization')} />
      </Field>
      <Field label={t('url')} description={t('urlHint')} error={fieldError('contentUrl')} required>
        <Input type="url" inputMode="url" placeholder="https://" {...form.register('contentUrl')} />
      </Field>
      <Field
        label={t('proof')}
        description={t('proofHint')}
        error={fieldError('ownershipProof')}
        required
      >
        <Textarea rows={6} {...form.register('ownershipProof')} />
      </Field>
      <Controller
        control={form.control}
        name="statement"
        render={({ field }) => (
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(value) => field.onChange(value === true)}
            label={t('statement')}
            error={fieldError('statement')}
          />
        )}
      />
      <Turnstile
        siteKey={siteKey}
        nonce={nonce}
        action="copyright"
        onToken={(token) => form.setValue('turnstileToken', token)}
        error={fieldError('turnstileToken')}
      />
      <Button type="submit" className="self-start" loading={submitting}>
        {t('submit')}
      </Button>
    </form>
  );
}
