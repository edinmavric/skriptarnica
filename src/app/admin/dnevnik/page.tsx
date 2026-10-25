import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableScroll } from '@/components/ui/table-scroll';
import { formatDateTime } from '@/lib/format';
import { listAuditLog } from '@/server/services/admin/system';

/** Audit log (SPEC §3.6, §4.10): append-only, newest first, filterable. */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ akcija?: string; ko?: string; meta?: string; pre?: string }>;
}) {
  const t = await getTranslations('admin.audit');
  const query = await searchParams;
  const before = query.pre && !Number.isNaN(Date.parse(query.pre)) ? query.pre : undefined;
  const target = query.meta && /^[0-9a-f-]{36}$/.test(query.meta) ? query.meta : undefined;
  const { rows, nextCursor } = await listAuditLog({
    action: query.akcija,
    actor: query.ko,
    target,
    before,
  });
  const base = `?akcija=${encodeURIComponent(query.akcija ?? '')}&ko=${encodeURIComponent(query.ko ?? '')}&meta=${encodeURIComponent(query.meta ?? '')}`;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <form role="search" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('action')}</span>
          <Input name="akcija" defaultValue={query.akcija ?? ''} placeholder="user." />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('actor')}</span>
          <Input name="ko" defaultValue={query.ko ?? ''} placeholder="admin@" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>{t('target')}</span>
          <Input
            name="meta"
            defaultValue={query.meta ?? ''}
            className="min-w-72 font-mono text-xs"
          />
        </label>
        <Button type="submit" variant="secondary">
          {t('filter')}
        </Button>
      </form>
      <TableScroll label={t('title')}>
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-rule text-ink-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">{t('when')}</th>
              <th className="py-2 pr-3 font-medium">{t('actor')}</th>
              <th className="py-2 pr-3 font-medium">{t('action')}</th>
              <th className="py-2 pr-3 font-medium">{t('target')}</th>
              <th className="py-2 font-medium">{t('details')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule align-top">
            {rows.map(({ entry, actorEmail }) => (
              <tr key={entry.id}>
                <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(entry.createdAt)}</td>
                <td className="py-2 pr-3">{actorEmail ?? t('system')}</td>
                <td className="py-2 pr-3 font-medium">{entry.action}</td>
                <td className="py-2 pr-3 font-mono text-xs break-all">
                  {entry.targetType}
                  {entry.targetId ? `:${entry.targetId}` : ''}
                </td>
                <td className="py-2 font-mono text-xs break-all">
                  {Object.keys(entry.details).length > 0 ? JSON.stringify(entry.details) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {rows.length === 0 ? <p className="text-ink-muted">{t('none')}</p> : null}
      {nextCursor ? (
        <Link
          href={`${base}&pre=${encodeURIComponent(nextCursor)}`}
          className="self-start text-pen underline underline-offset-2"
        >
          {t('older')}
        </Link>
      ) : null}
    </div>
  );
}
