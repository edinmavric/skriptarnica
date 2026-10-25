'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { BookmarkIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { routes } from '@/config/routes';
import { toggleBookmarkAction } from '@/server/actions/notes';

/** Optimistic "Sačuvaj" (SPEC §6.4); guests are sent to sign-in. */
export function BookmarkButton({
  noteId,
  saved,
  signedIn,
  returnTo,
}: {
  noteId: string;
  saved: boolean;
  signedIn: boolean;
  returnTo: string;
}) {
  const t = useTranslations('notes.page');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [optimistic, setOptimistic] = useOptimistic(saved);
  const [, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      aria-pressed={optimistic}
      onClick={() => {
        if (!signedIn) {
          router.push(`${routes.signIn}?next=${encodeURIComponent(returnTo)}`);
          return;
        }
        startTransition(async () => {
          setOptimistic(!optimistic);
          const result = await toggleBookmarkAction({ noteId, saved: !optimistic });
          if (!result.ok) toast({ title: tAll(result.error.messageKey), tone: 'error' });
          router.refresh();
        });
      }}
    >
      <BookmarkIcon filled={optimistic} /> {optimistic ? t('saved') : t('save')}
    </Button>
  );
}
