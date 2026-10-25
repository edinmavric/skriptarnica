'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PARA_PER_RSD } from '@/config/constants';
import { formatPrice } from '@/lib/format';
import { requestPayoutAction } from '@/server/actions/purchase';

export function PayoutForm({
  availablePara,
  minPara,
  last4,
}: {
  availablePara: number;
  minPara: number;
  last4: string | null;
}) {
  const t = useTranslations('seller.money.payout');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const maxRsd = Math.floor(Math.max(availablePara, 0) / PARA_PER_RSD);
  const [amount, setAmount] = useState(String(maxRsd));
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (availablePara < minPara) {
    return (
      <p className="text-sm text-ink-muted">
        {t('belowMinimum', {
          min: formatPrice(minPara),
          available: formatPrice(Math.max(availablePara, 0)),
        })}
      </p>
    );
  }
  return (
    <div className="flex max-w-sm flex-col gap-3">
      <FormAlert tone={message?.tone ?? 'error'} message={message?.text ?? null} />
      <Field
        label={t('amount')}
        description={t('hint', { min: formatPrice(minPara), last4: last4 ?? '—' })}
      >
        <Input
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
        />
      </Field>
      <Button
        className="self-start"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await requestPayoutAction({ amountRsd: Number(amount) });
            if (result.ok) {
              setMessage({ tone: 'success', text: t('requested') });
              router.refresh();
            } else
              setMessage({
                tone: 'error',
                text: tAll(result.error.fieldErrors?.amountRsd?.[0] ?? result.error.messageKey),
              });
          })
        }
      >
        {t('submit')}
      </Button>
    </div>
  );
}
