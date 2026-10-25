'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { routes } from '@/config/routes';
import { orderStatusAction } from '@/server/actions/purchase';

/**
 * Returning from the provider doesn't grant access (SPEC §5.3.4): we wait for the webhook and
 * poll the order status.
 */
export function PaymentStatus({
  orderId,
  initial,
  noteId,
  noteSlug,
}: {
  orderId: string;
  initial: string;
  noteId: string;
  noteSlug: string;
}) {
  const t = useTranslations('purchase.status');
  const [status, setStatus] = useState(initial);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (status !== 'pending') return;
    let active = true;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      attempts += 1;
      const result = await orderStatusAction({ orderId });
      if (!active) return;
      if (result.ok && result.value) setStatus(result.value.status);
      if (attempts > 20) setSlow(true);
      if (!result.ok || result.value?.status === 'pending')
        timer = setTimeout(poll, attempts < 10 ? 1500 : 4000);
    }
    timer = setTimeout(poll, 800);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [orderId, status]);

  if (status === 'paid') {
    return (
      <div className="flex flex-col gap-4">
        <FormAlert tone="success" message={t('paid')} />
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href={`/api/preuzimanje/${noteId}`}>{t('download')}</a>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href={routes.library}>{t('toLibrary')}</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (status === 'pending') {
    return (
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-lg">
          <Spinner /> {t('processing')}
        </p>
        <p className="text-ink-muted">{slow ? t('slow') : t('wait')}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <FormAlert message={t('failed')} />
      <Button asChild className="self-start">
        <Link href={`/kupovina/${noteId}`}>{t('retry')}</Link>
      </Button>
      <Link href={routes.note(noteSlug)} className="text-sm text-pen underline underline-offset-2">
        {t('backToNote')}
      </Link>
    </div>
  );
}
