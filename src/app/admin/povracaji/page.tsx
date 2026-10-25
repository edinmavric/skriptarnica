import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { RefundDecision } from '@/components/features/admin/refund-decision';
import { EmptyState } from '@/components/ui/empty-state';
import { routes } from '@/config/routes';
import { formatDate, formatPrice } from '@/lib/format';
import { listRefunds } from '@/server/services/admin/money';

export default async function AdminRefundsPage() {
  const t = await getTranslations('admin.refunds');
  const tReasons = await getTranslations('library.refund.reasons');
  const rows = await listRefunds(['requested']);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {rows.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {rows.map((row) => (
            <li key={row.refund.id} className="flex flex-col gap-2 py-4">
              <p>
                <Link
                  href={routes.note(row.noteSlug)}
                  className="font-medium text-pen underline underline-offset-2"
                >
                  {row.noteTitle}
                </Link>{' '}
                — {row.buyerName} ({row.buyerEmail}), {formatPrice(row.totalPara)},{' '}
                {row.paidAt ? formatDate(row.paidAt) : ''}
              </p>
              <p className="text-sm">
                <span className="font-medium">{tReasons(row.refund.reason)}:</span>{' '}
                {row.refund.text}
              </p>
              <RefundDecision refundId={row.refund.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
