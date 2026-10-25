'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { setNoteListedAction } from '@/server/actions/notes';

export function ListingToggle({ noteId, listed }: { noteId: string; listed: boolean }) {
  const t = useTranslations('seller.dashboard');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setNoteListedAction({ noteId, listed: !listed });
          if (result.ok) {
            toast({ title: listed ? t('unlisted') : t('relisted'), tone: 'success' });
            router.refresh();
          } else toast({ title: tAll(result.error.messageKey), tone: 'error' });
        })
      }
    >
      {listed ? t('unlist') : t('relist')}
    </Button>
  );
}
