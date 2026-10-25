'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { ChevronDownIcon, EyeIcon, UploadIcon } from '@/components/ui/icons';
import { useToast } from '@/components/ui/toast';
import { setNoteListedAction } from '@/server/actions/notes';

/**
 * The less frequent actions on a listed note (new version, take off sale / put back on sale),
 * kept out of the row so "Izmeni" is the obvious action and the sale toggle isn't one stray
 * tap away.
 */
export function NoteActionsMenu({
  noteId,
  listed,
  title,
}: {
  noteId: string;
  listed: boolean;
  title: string;
}) {
  const t = useTranslations('seller.dashboard');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button variant="ghost" size="sm" loading={pending} aria-label={t('moreFor', { title })}>
          {t('more')} <ChevronDownIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownItem asChild>
          <Link href={`/prodaja/skripta/${noteId}/nova-verzija`}>
            <UploadIcon /> {t('newVersion')}
          </Link>
        </DropdownItem>
        <DropdownItem
          danger={listed}
          onSelect={() =>
            startTransition(async () => {
              const result = await setNoteListedAction({ noteId, listed: !listed });
              if (result.ok) {
                toast({ title: listed ? t('unlisted') : t('relisted'), tone: 'success' });
                router.refresh();
              } else toast({ title: tAll(result.error.messageKey), tone: 'error' });
            })
          }
        >
          <EyeIcon /> {listed ? t('unlist') : t('relist')}
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
