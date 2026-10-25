'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { routes } from '@/config/routes';
import { createOrderAction } from '@/server/actions/purchase';

/**
 * Order review (SPEC §4.3): a required, unticked checkbox for immediate access to digital
 * content and its effect on the right of withdrawal ⚖️. The idempotency key is fixed per page
 * view, so double clicks and retries resume the same order.
 */
export function CheckoutForm({ noteId, free }: { noteId: string; free: boolean }) {
  const t = useTranslations('purchase.review');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [waiver, setWaiver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiverError, setWaiverError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!waiver) {
      setWaiverError(tAll('validation.withdrawalWaiverRequired'));
      return;
    }
    setWaiverError(undefined);
    startTransition(async () => {
      const result = await createOrderAction({ noteId, idempotencyKey, withdrawalWaiver: true });
      if (!result.ok) {
        setError(tAll(result.error.messageKey));
        return;
      }
      if (result.value.kind === 'redirect') window.location.assign(result.value.url);
      else router.push(`${routes.library}?nova=${result.value.orderId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormAlert message={error} />
      <Checkbox
        checked={waiver}
        onCheckedChange={(value) => setWaiver(value === true)}
        error={waiverError}
        label={t.rich('waiver', {
          link: (chunks) => (
            <Link
              href={routes.legal.refunds}
              target="_blank"
              className="text-pen underline underline-offset-2"
            >
              {chunks}
            </Link>
          ),
        })}
      />
      <Button size="lg" loading={pending} onClick={submit}>
        {free ? t('getFree') : t('pay')}
      </Button>
      {!free ? <p className="text-sm text-ink-muted">{t('redirectNote')}</p> : null}
    </div>
  );
}
