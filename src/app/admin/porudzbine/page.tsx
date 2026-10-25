import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { TableScroll } from '@/components/ui/table-scroll';
import { formatDateTime, formatPrice } from '@/lib/format';
import { listOrders } from '@/server/services/admin/finance';

const STATUSES = ['pending', 'paid', 'failed', 'refunded', 'disputed'] as const;
type Status = (typeof STATUSES)[number];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; strana?: string }>;
}) {
  const t = await getTranslations('admin.orders');
  const query = await searchParams;
  const status = STATUSES.includes(query.status as Status) ? (query.status as Status) : null;
  const page = Math.max(0, Number(query.strana ?? 0) || 0);
  const { rows, hasMore } = await listOrders({ status, query: query.q ?? '', page });
  const qs = (p: number) =>
    `?q=${encodeURIComponent(query.q ?? '')}&status=${status ?? ''}&strana=${p}`;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <form role="search" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('search')}</span>
          <Input
            name="q"
            defaultValue={query.q ?? ''}
            placeholder={t('searchPlaceholder')}
            className="min-w-64"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('statusLabel')}</span>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">{t('allStatuses')}</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`status.${value}`)}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          {t('filter')}
        </Button>
      </form>
      <TableScroll label={t('title')}>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-rule text-ink-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">{t('created')}</th>
              <th className="py-2 pr-3 font-medium">{t('buyer')}</th>
              <th className="py-2 pr-3 font-medium">{t('statusLabel')}</th>
              <th className="py-2 text-right font-medium">{t('total')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map(({ order, buyerEmail }) => (
              <tr key={order.id}>
                <td className="py-2 pr-3 whitespace-nowrap">
                  <Link
                    href={`/admin/porudzbine/${order.id}`}
                    className="text-pen underline underline-offset-2"
                  >
                    {formatDateTime(order.createdAt)}
                  </Link>
                </td>
                <td className="py-2 pr-3">{buyerEmail}</td>
                <td className="py-2 pr-3">
                  <Badge
                    tone={
                      order.status === 'paid'
                        ? 'success'
                        : order.status === 'failed'
                          ? 'danger'
                          : 'neutral'
                    }
                  >
                    {t(`status.${order.status}`)}
                  </Badge>
                </td>
                <td className="tabular py-2 text-right">{formatPrice(order.totalPara)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {rows.length === 0 ? <p className="text-ink-muted">{t('none')}</p> : null}
      <div className="flex gap-3">
        {page > 0 ? (
          <Link href={qs(page - 1)} className="text-pen underline underline-offset-2">
            {t('prev')}
          </Link>
        ) : null}
        {hasMore ? (
          <Link href={qs(page + 1)} className="text-pen underline underline-offset-2">
            {t('next')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
