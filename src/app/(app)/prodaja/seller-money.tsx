import { getTranslations } from 'next-intl/server';

import { PayoutForm } from '@/components/features/seller/payout-form';
import { SalesChart } from '@/components/features/seller/sales-chart';
import { Badge } from '@/components/ui/badge';
import { formatDate, formatPrice } from '@/lib/format';
import { sellerBalances } from '@/server/services/ledger';
import { salesPerDay } from '@/server/services/seller-stats';
import { getSellerProfile } from '@/server/services/sellers';
import { getSettings } from '@/server/services/settings';
import { listSellerPayouts } from '@/server/services/wallet';

const payoutTone = {
  requested: 'warning',
  approved: 'pen',
  processing: 'pen',
  paid: 'success',
  rejected: 'danger',
} as const;

/** Revenue at a glance (pending / available / paid out), above the seller's notes (SPEC §4.4). */
export async function SellerBalances({ userId }: { userId: string }) {
  const [t, balances, settings] = await Promise.all([
    getTranslations('seller.money'),
    sellerBalances(userId),
    getSettings(),
  ]);
  const stats = [
    {
      key: 'pending',
      value: balances.pendingPara,
      hint: t('pendingHint', { days: settings.fundsHoldDays }),
    },
    {
      key: 'available',
      value: balances.availablePara,
      hint: balances.availablePara < 0 ? t('negativeHint') : t('availableHint'),
    },
    { key: 'paidOut', value: balances.paidOutPara, hint: t('paidOutHint') },
  ] as const;
  return (
    <section aria-labelledby="money-heading">
      <h2 id="money-heading" className="sr-only">
        {t('title')}
      </h2>
      <dl className="grid grid-cols-3 divide-x divide-rule border-y border-rule">
        {stats.map((stat) => (
          <div key={stat.key} className="flex flex-col gap-1 px-3 py-3 first:pl-0 sm:px-5 sm:py-4">
            <dt className="text-sm text-ink-muted">{t(stat.key)}</dt>
            <dd
              className={`tabular text-lg font-semibold sm:text-3xl ${stat.value < 0 ? 'text-danger' : ''}`}
            >
              {formatPrice(stat.value)}
            </dd>
            <dd className="hidden text-sm text-ink-muted sm:block">{stat.hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Sales chart, payout request and payout history, below the notes. */
export async function SellerActivity({ userId }: { userId: string }) {
  const [t, balances, sales, payouts, settings, profile] = await Promise.all([
    getTranslations('seller.money'),
    sellerBalances(userId),
    salesPerDay(userId, 30),
    listSellerPayouts(userId),
    getSettings(),
    getSellerProfile(userId),
  ]);
  return (
    <section aria-labelledby="activity-heading" className="flex flex-col gap-4">
      <h2 id="activity-heading" className="text-display-sm font-semibold">
        {t('activityTitle')}
      </h2>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h3 className="mb-2 font-sans text-base font-semibold">{t('chart.title')}</h3>
          <SalesChart data={sales} />
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="font-sans text-base font-semibold">{t('payout.title')}</h3>
          <PayoutForm
            availablePara={balances.availablePara}
            minPara={settings.minPayoutPara}
            last4={profile?.payoutAccountLast4 ?? null}
          />
          {payouts.length > 0 ? (
            <ul className="divide-y divide-rule border-y border-rule text-sm">
              {payouts.map((payout) => (
                <li
                  key={payout.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="tabular font-medium">{formatPrice(payout.amountPara)}</span>
                  <span className="text-ink-muted">{formatDate(payout.createdAt)}</span>
                  <Badge tone={payoutTone[payout.status]}>
                    {t(`payout.status.${payout.status}`)}
                  </Badge>
                  {payout.status === 'rejected' && payout.rejectionReason ? (
                    <span className="w-full text-danger">{payout.rejectionReason}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
