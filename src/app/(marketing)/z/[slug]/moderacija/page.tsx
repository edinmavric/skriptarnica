import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import {
  BanForm,
  ModeratorForm,
  ReportResolution,
} from '@/components/features/forum/moderation-tools';
import { routes } from '@/config/routes';
import { formatDateTime } from '@/lib/format';
import { requireAppUser } from '@/server/auth/session';
import { loadCommunity } from '@/server/services/communities';
import {
  communityReports,
  listBannedMembers,
  modLog,
  PERMANENT_BAN,
} from '@/server/services/forum';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Community moderation (SPEC §4.7): reports queue, mod log, bans, moderators. */
export default async function ModerationPage({ params }: { params: Promise<{ slug: string }> }) {
  const user = await requireAppUser();
  const { slug } = await params;
  const loaded = await loadCommunity(slug, user);
  if (!loaded?.isModerator) notFound();
  const { community } = loaded;
  const t = await getTranslations('forum.moderation');
  const tReasons = await getTranslations('reports.reasons');
  const [reportsResult, logResult, bannedResult] = await Promise.all([
    communityReports(user, community.id),
    modLog(user, community.id),
    listBannedMembers(user, community.id),
  ]);
  const reports = reportsResult.ok ? reportsResult.value : [];
  const log = logResult.ok ? logResult.value : [];
  const banned = bannedResult.ok ? bannedResult.value : [];
  const isOwner = loaded.access.membership?.role === 'owner' || user.role === 'admin';
  return (
    <div className="flex flex-col gap-10">
      <div>
        <Link
          href={routes.community(slug)}
          className="text-sm text-pen underline underline-offset-2"
        >
          z/{slug}
        </Link>
        <h1 className="text-display font-bold">{t('title')}</h1>
      </div>

      <section aria-labelledby="reports-heading">
        <h2 id="reports-heading" className="mb-3 text-display-sm font-semibold">
          {t('reports', { count: reports.length })}
        </h2>
        {reports.length === 0 ? (
          <p className="text-ink-muted">{t('noReports')}</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {reports.map((row) => (
              <li key={row.report.id} className="flex flex-col gap-2 py-3">
                <p className="text-sm">
                  <span className="font-medium">{tReasons(row.report.reason)}</span>
                  {row.report.text ? `: ${row.report.text}` : ''}
                </p>
                {row.post?.id ? (
                  <Link
                    href={routes.post(slug, row.post.id, row.post.slug)}
                    className="text-pen underline underline-offset-2"
                  >
                    {row.post.title}
                  </Link>
                ) : null}
                {row.comment?.id ? (
                  <p className="line-clamp-2 border-l-2 border-rule pl-3 text-sm text-ink-muted">
                    {row.comment.body}
                  </p>
                ) : null}
                <ReportResolution reportId={row.report.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ban-heading" className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 id="ban-heading" className="mb-3 text-display-sm font-semibold">
            {t('bans')}
          </h2>
          <BanForm communityId={community.id} />
          {banned.length > 0 ? (
            <ul className="mt-4 text-sm">
              {banned.map((row) => (
                <li key={row.username ?? row.name}>
                  {row.username}:{' '}
                  {row.bannedUntil && row.bannedUntil >= PERMANENT_BAN
                    ? t('durations.permanent')
                    : t('until', { date: row.bannedUntil ? formatDateTime(row.bannedUntil) : '' })}
                  {row.reason ? ` (${row.reason})` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {isOwner ? (
          <div>
            <h2 className="mb-3 text-display-sm font-semibold">{t('moderators')}</h2>
            <ModeratorForm communityId={community.id} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="log-heading">
        <h2 id="log-heading" className="mb-3 text-display-sm font-semibold">
          {t('log')}
        </h2>
        {log.length === 0 ? (
          <p className="text-ink-muted">{t('noLog')}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-rule text-ink-muted">
              <tr>
                <th className="py-2 pr-3 font-medium">{t('when')}</th>
                <th className="py-2 pr-3 font-medium">{t('who')}</th>
                <th className="py-2 pr-3 font-medium">{t('what')}</th>
                <th className="py-2 font-medium">{t('reason')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {log.map((row) => (
                <tr key={row.action.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {formatDateTime(row.action.createdAt)}
                  </td>
                  <td className="py-2 pr-3">{row.actorName ?? '—'}</td>
                  <td className="py-2 pr-3">{t(`actions.${row.action.action}`)}</td>
                  <td className="py-2">{row.action.reason ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
