'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { routes } from '@/config/routes';
import { confirmDeletionByTokenAction } from '@/server/actions/account';

export function ConfirmDeletionByLink({ token }: { token: string }) {
  const t = useTranslations('settings.data.delete');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <FormAlert message={error} />
      <Button
        variant="danger"
        className="self-start"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await confirmDeletionByTokenAction({ token });
            if (result.ok) router.push(`${routes.settings}/podaci`);
            else setError(tAll(result.error.messageKey));
          })
        }
      >
        {t('confirm')}
      </Button>
    </div>
  );
}
