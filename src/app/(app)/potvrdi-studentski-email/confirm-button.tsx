'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { routes } from '@/config/routes';
import { confirmStudentEmailAction } from '@/server/actions/onboarding';

/** Confirmation needs a click (POST), so link scanners in mail clients can't consume the token. */
export function ConfirmStudentEmail({ token }: { token: string }) {
  const t = useTranslations('onboarding.verify');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (state?.ok) {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success" message={state.message} />
        <Button asChild className="self-start">
          <Link href={routes.home}>{t('toHome')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <FormAlert message={state?.message ?? null} />
      <Button
        className="self-start"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await confirmStudentEmailAction({ token });
            setState(
              result.ok
                ? { ok: true, message: t('confirmed') }
                : { ok: false, message: tAll(result.error.messageKey) },
            );
          })
        }
      >
        {t('confirm')}
      </Button>
    </div>
  );
}
