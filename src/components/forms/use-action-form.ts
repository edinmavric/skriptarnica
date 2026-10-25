'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  useForm,
  type DefaultValues,
  type FieldPath,
  type FieldValues,
  type Resolver,
} from 'react-hook-form';
import type { z } from 'zod';

import type { AppError, Result } from '@/lib/result';

/**
 * react-hook-form + zod (shared schema) + a Server Action returning Result.
 * Server field errors are mapped back onto fields; focus moves to the first invalid field
 * (SPEC §8.1). Messages are i18n keys; "key|n" carries one numeric parameter.
 */
export function useActionForm<S extends z.ZodType<FieldValues, FieldValues>, T>({
  schema,
  action,
  defaultValues,
  onSuccess,
}: {
  schema: S;
  action: (input: z.input<S>) => Promise<Result<T>>;
  defaultValues: DefaultValues<z.input<S>>;
  onSuccess: (value: T) => void | Promise<void>;
}) {
  const tAll = useTranslations();
  // Keys come from server Results, so they are dynamic strings here.
  const t = tAll as unknown as (key: string, values?: Record<string, number>) => string;
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    resolver: zodResolver(schema as never) as unknown as Resolver<z.input<S>, unknown, z.output<S>>,
    defaultValues,
    shouldFocusError: true,
    mode: 'onTouched',
  });

  const translate = (key: string | undefined): string | undefined => {
    if (!key) return undefined;
    const [messageKey, param] = key.split('|');
    if (!messageKey) return undefined;
    return t(messageKey, param ? { n: Number(param) } : {});
  };

  function applyServerError(error: AppError) {
    const entries = Object.entries(error.fieldErrors ?? {});
    let focused = false;
    for (const [field, messages] of entries) {
      if (field === '_form') {
        setFormError(translate(messages[0]) ?? null);
        continue;
      }
      form.setError(
        field as FieldPath<z.input<S>>,
        { type: 'server', message: messages[0] },
        { shouldFocus: !focused },
      );
      focused = true;
    }
    if (
      !entries.some(([field]) => field !== '_form') &&
      !entries.some(([field]) => field === '_form')
    ) {
      setFormError(translate(error.messageKey) ?? null);
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const result = await action(values as z.input<S>);
    if (result.ok) {
      await onSuccess(result.value);
    } else {
      applyServerError(result.error);
    }
  });

  const fieldError = (name: FieldPath<z.input<S>>): string | undefined => {
    const message = form.getFieldState(name, form.formState).error?.message;
    return translate(message);
  };

  return {
    form,
    onSubmit,
    formError,
    setFormError,
    fieldError,
    submitting: form.formState.isSubmitting,
  };
}
