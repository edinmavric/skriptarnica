import { getTranslations } from 'next-intl/server';

import { PayoutDecision } from '@/components/features/admin/payout-decision';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatPrice } from '@/lib/format';
import { listPayouts } from '@/server/services/admin/money';

export default async function AdminPayoutsPage() {
  const t = await getTranslations('admin.payouts');
  const tStatus = await getTranslations('seller.money.payout.status');
  const rows = await listPayouts(['requested', 'approved', 'processing']);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {rows.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((row) => (
            <li key={row.payout.id} className="flex flex-col gap-2 py-4">
              <p className="flex flex-wrap items-center gap-2">
                <span className="tabular text-lg font-semibold">
                  {formatPrice(row.payout.amountPara)}
                </span>
                <span>
                  {row.sellerName} ({row.sellerEmail})
                </span>
                <span className="text-sm text-ink-muted">{formatDate(row.payout.createdAt)}</span>
                <Badge tone="warning">{tStatus(row.payout.status)}</Badge>
                <span className="text-sm text-ink-muted">
                  {t('last4', { last4: row.payout.accountLast4 ?? '—' })}
                </span>
              </p>
              <PayoutDecision payoutId={row.payout.id} status={row.payout.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
