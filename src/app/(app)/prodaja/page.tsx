import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { NoteActionsMenu } from '@/components/features/seller/listing-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PlusIcon } from '@/components/ui/icons';
import { PriceTag } from '@/components/ui/price-tag';
import { routes } from '@/config/routes';
import { formatPercent, formatRelative } from '@/lib/format';
import { requireAppUser } from '@/server/auth/session';
import { listSellerNotes } from '@/server/services/notes';
import { getSellerProfile, isActiveSeller } from '@/server/services/sellers';

import { SellerActivity, SellerBalances } from './seller-money';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller.dashboard');
  return { title: t('title') };
}

const statusTone = {
  draft: 'neutral',
  processing: 'neutral',
  pending_review: 'warning',
  published: 'success',
  rejected: 'danger',
  unlisted: 'outline',
  removed: 'danger',
} as const;

export default async function SellerDashboardPage() {
  const user = await requireAppUser();
  const profile = await getSellerProfile(user.id);
  if (!isActiveSeller(profile) && profile?.status !== 'suspended') redirect(routes.becomeSeller);
  const [t, notes] = await Promise.all([
    getTranslations('seller.dashboard'),
    listSellerNotes(user.id),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-display font-bold">{t('title')}</h1>
        <Button asChild>
          <Link href={routes.sellNew}>
            <PlusIcon /> {t('newNote')}
          </Link>
        </Button>
      </div>

      <SellerBalances userId={user.id} />

      <section aria-labelledby="my-notes">
        <h2 id="my-notes" className="mb-3 text-display-sm font-semibold">
          {t('notes')}
        </h2>
        {notes.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={
              <Button asChild>
                <Link href={routes.sellNew}>{t('newNote')}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {notes.map((note) => {
              const conversion = note.viewCount > 0 ? note.salesCount / note.viewCount : null;
              const live = note.status === 'published' || note.status === 'unlisted';
              return (
                <li
                  key={note.id}
                  className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {live ? (
                        <Link
                          href={routes.note(note.slug)}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {note.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{note.title || t('untitled')}</span>
                      )}
                      <Badge tone={statusTone[note.status]}>{t(`status.${note.status}`)}</Badge>
                    </div>
                    <p className="text-sm text-ink-muted">
                      {note.courseName ?? '—'},{' '}
                      {t('updated', { when: formatRelative(note.updatedAt) })}
                    </p>
                    {note.status === 'removed' ? (
                      <p className="mt-1 text-sm text-danger">
                        {t('removedBecause', { reason: note.rejectionReason ?? '—' })}{' '}
                        <Link
                          href={`/prodaja/skripta/${note.id}/prigovor`}
                          className="underline underline-offset-2"
                        >
                          {t('counterNotice')}
                        </Link>
                      </p>
                    ) : null}
                    {note.status === 'rejected' && note.rejectionReason ? (
                      <p className="mt-1 text-sm text-danger">
                        {t('rejectedBecause', { reason: note.rejectionReason })}
                      </p>
                    ) : null}
                    {live ? (
                      <p className="tabular mt-1 text-sm text-ink-muted">
                        {t('stats', { views: note.viewCount, sales: note.salesCount })}
                        {conversion !== null
                          ? `, ${t('conversion', { percent: formatPercent(conversion) })}`
                          : ''}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <PriceTag para={note.pricePara} size="sm" className="mr-2" />
                    <Button asChild variant="secondary" size="sm">
                      <Link
                        href={`/prodaja/skripta/${note.id}?korak=${note.status === 'draft' ? note.wizardStep : 4}`}
                      >
                        {note.status === 'draft' || note.status === 'rejected'
                          ? t('continue')
                          : t('edit')}
                      </Link>
                    </Button>
                    {live ? (
                      <NoteActionsMenu
                        noteId={note.id}
                        listed={note.status === 'published'}
                        title={note.title}
                      />
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SellerActivity userId={user.id} />
    </div>
  );
}
