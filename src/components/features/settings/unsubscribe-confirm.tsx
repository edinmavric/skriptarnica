'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { routes } from '@/config/routes';
import { unsubscribeAction } from '@/server/actions/unsubscribe';

export function UnsubscribeConfirm({ token }: { token: string }) {
  const t = useTranslations('unsubscribe');
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle');
  const [pending, startTransition] = useTransition();
  if (state === 'done')
    return (
      <div className="flex flex-col gap-3">
        <FormAlert tone="success" message={t('done')} />
        <Link
          href={`${routes.settings}/obavestenja`}
          className="text-pen underline underline-offset-2"
        >
          {t('manage')}
        </Link>
      </div>
    );
  return (
    <div className="flex flex-col gap-3">
      <FormAlert message={state === 'error' ? t('invalid') : null} />
      <Button
        className="self-start"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await unsubscribeAction({ token });
            setState(result.ok ? 'done' : 'error');
          })
        }
      >
        {t('confirm')}
      </Button>
    </div>
  );
}
