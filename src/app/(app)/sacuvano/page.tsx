import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { NoteCard } from '@/components/ui/note-card';
import { routes } from '@/config/routes';
import { requireAppUser } from '@/server/auth/session';
import { savedNotes } from '@/server/services/feed';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('savedPage');
  return { title: t('title') };
}

export default async function SavedPage() {
  const user = await requireAppUser();
  const [t, cards] = await Promise.all([getTranslations('savedPage'), savedNotes(user.id)]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      {cards.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          action={
            <Button asChild>
              <Link href={routes.home}>{t('emptyAction')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((card) => (
            <li key={card.id}>
              <NoteCard note={card} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
