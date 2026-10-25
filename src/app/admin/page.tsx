import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { SalesChart } from '@/components/features/seller/sales-chart';
import { formatNumber, formatPrice } from '@/lib/format';
import { pendingCatalogRequestCount } from '@/server/services/admin/catalog-admin';
import { dashboardStats } from '@/server/services/admin/finance';
import { openClaimCount, openReportCount } from '@/server/services/admin/moderation-admin';
import { listPendingNotes } from '@/server/services/admin/note-review';

/** Admin dashboard (SPEC §4.10): headline numbers, sales per day, and every queue with a link. */
export default async function AdminDashboardPage() {
  const t = await getTranslations('admin.dashboard');
  const [stats, pending, reports, claims, requests] = await Promise.all([
    dashboardStats(),
    listPendingNotes(),
    openReportCount(),
    openClaimCount(),
    pendingCatalogRequestCount(),
  ]);
  const figures = [
    {
      label: t('users'),
      value: formatNumber(stats.users),
      hint: t('newUsers', { count: stats.newUsers7d }),
    },
    { label: t('gmv'), value: formatPrice(stats.gmv30dPara), hint: t('last30') },
    { label: t('revenue'), value: formatPrice(stats.revenue30dPara), hint: t('last30') },
  ];
  const queues = [
    { label: t('reviewQueue'), value: pending.length, href: '/admin/skripte' },
    { label: t('openReports'), value: reports, href: '/admin/prijave' },
    { label: t('claims'), value: claims, href: '/admin/autorska-prava' },
    { label: t('catalogRequests'), value: requests, href: '/admin/katalog/zahtevi' },
    { label: t('pendingPayouts'), value: stats.pendingPayouts, href: '/admin/isplate' },
    { label: t('openRefunds'), value: stats.openRefunds, href: '/admin/povracaji' },
  ];
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <dl className="grid gap-4 sm:grid-cols-3">
        {figures.map((figure) => (
          <div key={figure.label} className="rounded-md border border-rule p-4">
            <dt className="text-sm text-ink-muted">{figure.label}</dt>
            <dd className="tabular mt-1 text-2xl font-semibold">{figure.value}</dd>
            <dd className="text-sm text-ink-muted">{figure.hint}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="sales-heading">
        <h2 id="sales-heading" className="mb-3 text-display-sm font-semibold">
          {t('chart.title')}
        </h2>
        <SalesChart
          data={stats.salesPerDay.map((point) => ({
            day: point.day,
            count: point.count,
            sellerPara: point.gmvPara,
          }))}
          namespace="admin.dashboard.chart"
        />
      </section>
      <section aria-labelledby="queues-heading">
        <h2 id="queues-heading" className="mb-3 text-display-sm font-semibold">
          {t('queues')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {queues.map((queue) => (
            <li key={queue.href}>
              <Link
                href={queue.href}
                className="flex items-baseline justify-between gap-3 rounded-md border border-rule p-4 hover:border-ink"
              >
                <span>{queue.label}</span>
                <span
                  className={
                    queue.value > 0
                      ? 'tabular text-xl font-semibold'
                      : 'tabular text-xl text-ink-muted'
                  }
                >
                  {queue.value}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
