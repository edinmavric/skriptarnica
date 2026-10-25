import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { routes } from '@/config/routes';
import { formatDateTime, formatPrice } from '@/lib/format';
import { getOrderDetail } from '@/server/services/admin/finance';

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getOrderDetail(id);
  if (!detail) notFound();
  const t = await getTranslations('admin.orders');
  const { order } = detail;
  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/porudzbine" className="text-sm text-pen underline underline-offset-2">
          {t('title')}
        </Link>
        <h1 className="text-display font-bold">
          {t('detailTitle', { total: formatPrice(order.totalPara) })}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <Badge tone={order.status === 'paid' ? 'success' : 'neutral'}>
            {t(`status.${order.status}`)}
          </Badge>
          <span>{formatDateTime(order.createdAt)}</span>
          <Link
            href={`/admin/korisnici/${detail.buyerId}`}
            className="text-pen underline underline-offset-2"
          >
            {detail.buyerEmail}
          </Link>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
        <dt className="text-ink-muted">ID</dt>
        <dd className="font-mono text-xs">{order.id}</dd>
        <dt className="text-ink-muted">{t('provider')}</dt>
        <dd>
          {order.provider}{' '}
          {order.providerRef ? (
            <span className="font-mono text-xs">({order.providerRef})</span>
          ) : null}
        </dd>
        <dt className="text-ink-muted">{t('paidAt')}</dt>
        <dd>{order.paidAt ? formatDateTime(order.paidAt) : '—'}</dd>
        {order.failureReason ? (
          <>
            <dt className="text-ink-muted">{t('failure')}</dt>
            <dd>{order.failureReason}</dd>
          </>
        ) : null}
      </dl>
      <section aria-labelledby="items-heading">
        <h2 id="items-heading" className="mb-2 text-display-sm font-semibold">
          {t('items')}
        </h2>
        <ul className="divide-y divide-rule border-y border-rule text-sm">
          {detail.items.map(({ item, title, slug }) => (
            <li key={item.id} className="flex flex-wrap justify-between gap-2 py-2">
              <Link href={routes.note(slug)} className="text-pen underline underline-offset-2">
                {title}
              </Link>
              <span className="tabular">
                {t('split', {
                  price: formatPrice(item.pricePara),
                  commission: formatPrice(item.commissionPara),
                  seller: formatPrice(item.sellerPara),
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="ledger-heading">
        <h2 id="ledger-heading" className="mb-2 text-display-sm font-semibold">
          {t('ledger')}
        </h2>
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-rule">
            {detail.ledger.map((entry) => (
              <tr key={entry.id}>
                <td className="py-1.5 pr-3 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                <td className="py-1.5 pr-3">{entry.accountType}</td>
                <td className="tabular py-1.5 pr-3 text-right">{formatPrice(entry.amountPara)}</td>
                <td className="py-1.5">{entry.referenceType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {detail.refunds.length > 0 ? (
        <section aria-labelledby="refunds-heading">
          <h2 id="refunds-heading" className="mb-2 text-display-sm font-semibold">
            {t('refunds')}
          </h2>
          <ul className="text-sm">
            {detail.refunds.map((refund) => (
              <li key={refund.id}>
                {formatDateTime(refund.createdAt)}: {refund.status},{' '}
                {formatPrice(refund.amountPara)}{' '}
                {refund.decisionNote ? `(${refund.decisionNote})` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
