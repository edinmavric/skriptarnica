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

/** Revenue (pending / available / paid out), sales chart and payouts (SPEC §4.4). */
export async function SellerMoney({ userId }: { userId: string }) {
  const [t, balances, sales, payouts, settings, profile] = await Promise.all([
    getTranslations('seller.money'),
    sellerBalances(userId),
    salesPerDay(userId, 30),
    listSellerPayouts(userId),
    getSettings(),
    getSellerProfile(userId),
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
    <section aria-labelledby="money-heading" className="flex flex-col gap-8">
      <h2 id="money-heading" className="sr-only">
        {t('title')}
      </h2>
      <dl className="grid divide-y divide-rule border-y border-rule sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {stats.map((stat) => (
          <div key={stat.key} className="flex flex-col gap-1 py-4 sm:px-5 sm:first:pl-0">
            <dt className="text-sm text-ink-muted">{t(stat.key)}</dt>
            <dd className={`text-3xl font-semibold ${stat.value < 0 ? 'text-danger' : ''}`}>
              {formatPrice(stat.value)}
            </dd>
            <dd className="text-sm text-ink-muted">{stat.hint}</dd>
          </div>
        ))}
      </dl>

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
