import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { ReportResolution } from '@/components/features/admin/report-resolution';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/format';
import { listReports, type ReportFilter } from '@/server/services/admin/moderation-admin';

const FILTERS: ReportFilter[] = ['open', 'resolved', 'dismissed'];

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const t = await getTranslations('admin.reports');
  const tReasons = await getTranslations('reports.reasons');
  const raw = (await searchParams).status;
  const status: ReportFilter = FILTERS.includes(raw as ReportFilter)
    ? (raw as ReportFilter)
    : 'open';
  const rows = await listReports(status);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <nav aria-label={t('filter')} className="flex gap-1 border-b border-rule">
        {FILTERS.map((filter) => (
          <Link
            key={filter}
            href={`?status=${filter}`}
            aria-current={filter === status ? 'page' : undefined}
            className={cn(
              '-mb-px min-h-11 content-center border-b-[2.5px] px-3 text-sm',
              filter === status ? 'border-ink font-medium' : 'border-transparent text-ink-muted',
            )}
          >
            {t(`status.${filter}`)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map(({ report, reporterName, target }) => (
            <li key={report.id} className="flex flex-col gap-3 rounded-md border border-rule p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="outline">{t(`targets.${report.targetType}`)}</Badge>
                <span className="font-medium">{tReasons(report.reason)}</span>
                <span className="text-ink-muted">
                  {formatDateTime(report.createdAt)}
                  {reporterName ? `, ${t('by', { name: reporterName })}` : ''}
                </span>
                {report.communityId ? <Badge tone="neutral">{t('community')}</Badge> : null}
              </div>
              {report.text ? <p className="text-sm">{report.text}</p> : null}
              {target ? (
                <div className="border-l-2 border-rule pl-3 text-sm">
                  {target.href ? (
                    <Link
                      href={target.href}
                      className="font-medium text-pen underline underline-offset-2"
                    >
                      {target.label}
                    </Link>
                  ) : (
                    <span className="font-medium">{target.label}</span>
                  )}
                  {target.excerpt ? (
                    <p className="mt-1 line-clamp-3 text-ink-muted">{target.excerpt}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-ink-muted">{t('targetGone')}</p>
              )}
              {status === 'open' ? (
                <ReportResolution
                  reportId={report.id}
                  canRemove={
                    ['note', 'review', 'post', 'comment'].includes(report.targetType) &&
                    Boolean(target)
                  }
                  canBan={Boolean(target?.ownerId)}
                />
              ) : (
                <p className="text-sm text-ink-muted">
                  {t('outcome', { action: report.action ?? '—' })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
