import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableScroll } from '@/components/ui/table-scroll';
import { formatDate } from '@/lib/format';
import { searchUsers } from '@/server/services/admin/users';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; strana?: string }>;
}) {
  const t = await getTranslations('admin.users');
  const { q = '', strana } = await searchParams;
  const page = Math.max(0, Number(strana ?? 0) || 0);
  const { rows, hasMore } = await searchUsers(q, page);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <form role="search" className="flex max-w-xl gap-2">
        <label htmlFor="user-search" className="sr-only">
          {t('search')}
        </label>
        <Input id="user-search" name="q" defaultValue={q} placeholder={t('searchPlaceholder')} />
        <Button type="submit" variant="secondary">
          {t('search')}
        </Button>
      </form>
      <TableScroll label={t('title')}>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-rule text-ink-muted">
            <tr>
              <th className="py-2 pr-3 font-medium">{t('user')}</th>
              <th className="py-2 pr-3 font-medium">{t('email')}</th>
              <th className="py-2 pr-3 font-medium">{t('status')}</th>
              <th className="py-2 font-medium">{t('joined')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-2 pr-3">
                  <Link
                    href={`/admin/korisnici/${row.id}`}
                    className="font-medium text-pen underline underline-offset-2"
                  >
                    {row.username ?? row.name}
                  </Link>
                </td>
                <td className="py-2 pr-3">{row.email}</td>
                <td className="py-2 pr-3">
                  <span className="flex flex-wrap gap-1">
                    {row.role === 'admin' ? <Badge tone="pen">{t('admin')}</Badge> : null}
                    {row.sellerStatus === 'active' ? (
                      <Badge tone="outline">{t('seller')}</Badge>
                    ) : null}
                    {row.bannedAt ? <Badge tone="danger">{t('banned')}</Badge> : null}
                    {row.deletedAt ? <Badge tone="neutral">{t('deleted')}</Badge> : null}
                  </span>
                </td>
                <td className="py-2 whitespace-nowrap">{formatDate(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {rows.length === 0 ? <p className="text-ink-muted">{t('none')}</p> : null}
      <div className="flex gap-3">
        {page > 0 ? (
          <Link
            href={`?q=${encodeURIComponent(q)}&strana=${page - 1}`}
            className="text-pen underline underline-offset-2"
          >
            {t('prev')}
          </Link>
        ) : null}
        {hasMore ? (
          <Link
            href={`?q=${encodeURIComponent(q)}&strana=${page + 1}`}
            className="text-pen underline underline-offset-2"
          >
            {t('next')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
