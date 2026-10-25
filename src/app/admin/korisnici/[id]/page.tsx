import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { AdjustmentForm, UserActions } from '@/components/features/admin/user-actions';
import { Badge } from '@/components/ui/badge';
import { TableScroll } from '@/components/ui/table-scroll';
import { routes } from '@/config/routes';
import { formatDate, formatDateTime, formatPrice } from '@/lib/format';
import { sellerLedger } from '@/server/services/admin/finance';
import { getUserDetail } from '@/server/services/admin/users';

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getUserDetail(id);
  if (!detail) notFound();
  const t = await getTranslations('admin.users');
  const { user, profile, seller } = detail;
  const ledger = seller ? await sellerLedger(user.id) : null;
  const facts: [string, string][] = [
    [t('email'), user.email],
    [t('username'), user.username ?? '—'],
    [t('joined'), formatDate(user.createdAt)],
    [t('faculty'), detail.facultyName ?? '—'],
    [t('verifiedStudent'), profile?.studentVerifiedAt ? t('yes') : t('no')],
    [t('twoFactor'), user.twoFactorEnabled ? t('yes') : t('no')],
    [t('paidOrders'), String(detail.paidOrders)],
    [t('notes'), String(detail.notes)],
    [t('reportsAgainst'), String(detail.reportsAgainst)],
    [t('sessions'), String(detail.activeSessions)],
  ];
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/korisnici" className="text-sm text-pen underline underline-offset-2">
          {t('back')}
        </Link>
        <h1 className="text-display font-bold">{user.name}</h1>
        <div className="flex flex-wrap gap-2">
          {user.role === 'admin' ? <Badge tone="pen">{t('admin')}</Badge> : null}
          {seller ? (
            <Badge tone="outline">{t('sellerStatus', { status: seller.status })}</Badge>
          ) : null}
          {user.bannedAt ? (
            <Badge tone="danger">{t('bannedSince', { date: formatDate(user.bannedAt) })}</Badge>
          ) : null}
          {user.deletedAt ? <Badge tone="neutral">{t('deleted')}</Badge> : null}
          {user.deletionScheduledFor ? (
            <Badge tone="warning">
              {t('deletionScheduled', { date: formatDate(user.deletionScheduledFor) })}
            </Badge>
          ) : null}
        </div>
        {user.banReason ? (
          <p className="text-sm">{t('banReason', { reason: user.banReason })}</p>
        ) : null}
        {user.username && !user.deletedAt ? (
          <Link
            href={routes.user(user.username)}
            className="text-sm text-pen underline underline-offset-2"
          >
            {t('publicProfile')}
          </Link>
        ) : null}
      </div>
      <UserActions
        userId={user.id}
        banned={Boolean(user.bannedAt)}
        twoFactor={user.twoFactorEnabled}
        isAdmin={user.role === 'admin'}
        deleted={Boolean(user.deletedAt)}
      />
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[12rem_1fr]">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-muted">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {ledger ? (
        <section aria-labelledby="wallet-heading" className="flex flex-col gap-4">
          <h2 id="wallet-heading" className="text-display-sm font-semibold">
            {t('wallet')}
          </h2>
          <dl className="grid gap-4 sm:grid-cols-3">
            {(['pendingPara', 'availablePara', 'paidOutPara'] as const).map((key) => (
              <div key={key} className="rounded-md border border-rule p-3">
                <dt className="text-sm text-ink-muted">{t(`balances.${key}`)}</dt>
                <dd className="tabular text-lg font-semibold">
                  {formatPrice(ledger.balances[key])}
                </dd>
              </div>
            ))}
          </dl>
          <h3 className="font-sans text-base font-semibold">{t('adjustment.title')}</h3>
          <AdjustmentForm sellerId={user.id} />
          <h3 className="font-sans text-base font-semibold">{t('ledger')}</h3>
          <TableScroll label={t('ledger')}>
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-rule text-ink-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">{t('when')}</th>
                  <th className="py-2 pr-3 font-medium">{t('account')}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t('amount')}</th>
                  <th className="py-2 font-medium">{t('description')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {ledger.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="py-2 pr-3">{entry.accountType}</td>
                    <td className="tabular py-2 pr-3 text-right">
                      {formatPrice(entry.amountPara)}
                    </td>
                    <td className="py-2">{entry.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </section>
      ) : null}
      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-display-sm font-semibold">
          {t('history')}
        </h2>
        {detail.history.length === 0 ? (
          <p className="text-ink-muted">{t('noHistory')}</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule text-sm">
            {detail.history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-3 py-2">
                <span className="whitespace-nowrap text-ink-muted">
                  {formatDateTime(entry.createdAt)}
                </span>
                <span className="font-medium">{entry.action}</span>
                {Object.keys(entry.details).length > 0 ? (
                  <code className="text-xs break-all text-ink-muted">
                    {JSON.stringify(entry.details)}
                  </code>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
