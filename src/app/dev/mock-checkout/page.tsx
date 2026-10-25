import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { formatPrice } from '@/lib/format';
import { getMockSession } from '@/server/payments/mock';

import { completeMockPaymentAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Mock "hosted payment page" (SPEC §5.2). Exists only outside production (dev layout guard).
 * A real processor's page collects card data; this one only lets you pick an outcome.
 */
export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref = '' } = await searchParams;
  const session = await getMockSession(ref);
  const t = await getTranslations('devCheckout');
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10"
    >
      <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">{t('banner')}</p>
      <h1 className="text-display font-bold">{t('title')}</h1>
      {!session ? (
        <p>{t('unknown')}</p>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-ink-muted">{t('description')}</dt>
            <dd>{session.description}</dd>
            <dt className="text-ink-muted">{t('amount')}</dt>
            <dd className="tabular font-semibold">{formatPrice(session.amount)}</dd>
            <dt className="text-ink-muted">{t('status')}</dt>
            <dd>{session.status}</dd>
          </dl>
          {session.status === 'pending' ? (
            <form action={completeMockPaymentAction} className="flex flex-col gap-2">
              <input type="hidden" name="ref" value={ref} />
              <Button type="submit" name="outcome" value="succeeded" size="lg">
                {t('success')}
              </Button>
              <Button type="submit" name="outcome" value="failed" variant="danger">
                {t('failure')}
              </Button>
              <Button type="submit" name="outcome" value="cancelled" variant="secondary">
                {t('cancel')}
              </Button>
            </form>
          ) : null}
        </>
      )}
    </main>
  );
}
