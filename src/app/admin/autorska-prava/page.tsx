import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { CopyrightDecision } from '@/components/features/admin/copyright-decision';
import { Badge } from '@/components/ui/badge';
import { routes } from '@/config/routes';
import { formatDateTime } from '@/lib/format';
import { listCopyrightClaims } from '@/server/services/admin/moderation-admin';

/** Copyright claims queue (SPEC §4.10): separate from reports, decisions are legal records. ⚖️ */
export default async function AdminCopyrightPage() {
  const t = await getTranslations('admin.copyright');
  const claims = await listCopyrightClaims();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="max-w-prose text-sm text-ink-muted">{t('intro')}</p>
      {claims.length === 0 ? (
        <p className="text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {claims.map(({ claim, noteTitle, noteSlug, noteStatus }) => (
            <li key={claim.id} className="flex flex-col gap-3 rounded-md border border-rule p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={claim.status === 'countered' ? 'warning' : 'outline'}>
                  {t(`status.${claim.status}`)}
                </Badge>
                <span className="font-medium">{claim.claimantName}</span>
                {claim.organization ? <span>({claim.organization})</span> : null}
                <span className="text-ink-muted">{formatDateTime(claim.createdAt)}</span>
              </div>
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-ink-muted">{t('email')}</dt>
                <dd>{claim.claimantEmail}</dd>
                <dt className="text-ink-muted">{t('url')}</dt>
                <dd className="break-all">{claim.contentUrl}</dd>
                <dt className="text-ink-muted">{t('note')}</dt>
                <dd>
                  {noteSlug ? (
                    <Link
                      href={routes.note(noteSlug)}
                      className="text-pen underline underline-offset-2"
                    >
                      {noteTitle}
                    </Link>
                  ) : (
                    t('noNote')
                  )}
                  {noteStatus ? ` (${noteStatus})` : ''}
                </dd>
                <dt className="text-ink-muted">{t('proof')}</dt>
                <dd className="whitespace-pre-line">{claim.ownershipProof}</dd>
                <dt className="text-ink-muted">{t('statement')}</dt>
                <dd>{formatDateTime(claim.statementAcceptedAt)}</dd>
                {claim.counterNotice ? (
                  <>
                    <dt className="text-ink-muted">{t('counterNotice')}</dt>
                    <dd className="whitespace-pre-line">{claim.counterNotice}</dd>
                  </>
                ) : null}
              </dl>
              <CopyrightDecision claimId={claim.id} hasNote={Boolean(claim.noteId)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
