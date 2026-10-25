'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { requestExportAction } from '@/server/actions/account';

export function DataExportButton({ pending: alreadyPending }: { pending: boolean }) {
  const t = useTranslations('settings.data.export');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <FormAlert tone={message?.tone ?? 'error'} message={message?.text ?? null} />
      <Button
        className="self-start"
        loading={pending}
        disabled={alreadyPending}
        onClick={() =>
          startTransition(async () => {
            const result = await requestExportAction({});
            setMessage(
              result.ok
                ? { tone: 'success', text: t('requested') }
                : { tone: 'error', text: tAll(result.error.messageKey) },
            );
            router.refresh();
          })
        }
      >
        {t('request')}
      </Button>
    </div>
  );
}
