'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { resendVerificationAction } from '@/server/auth/actions';

export function ResendVerification() {
  const t = useTranslations('auth.verifyPending');
  const tErrors = useTranslations();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <FormAlert tone={message?.tone ?? 'success'} message={message?.text ?? null} />
      <Button
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await resendVerificationAction({});
            setMessage(
              result.ok
                ? { tone: 'success', text: t('resent') }
                : {
                    tone: 'error',
                    text: (tErrors as unknown as (k: string) => string)(result.error.messageKey),
                  },
            );
          })
        }
      >
        {t('resend')}
      </Button>
    </div>
  );
}
