'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { routes } from '@/config/routes';
import { joinCommunityAction, leaveCommunityAction } from '@/server/actions/forum';

export function JoinButton({
  slug,
  joined,
  signedIn,
  canLeave = true,
}: {
  slug: string;
  joined: boolean;
  signedIn: boolean;
  canLeave?: boolean;
}) {
  const t = useTranslations('forum.community');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [optimistic, setOptimistic] = useOptimistic(joined);
  const [, startTransition] = useTransition();
  if (joined && !canLeave) return null;
  return (
    <Button
      variant={optimistic ? 'secondary' : 'primary'}
      aria-pressed={optimistic}
      onClick={() => {
        if (!signedIn) {
          router.push(`${routes.signIn}?next=${encodeURIComponent(routes.community(slug))}`);
          return;
        }
        startTransition(async () => {
          setOptimistic(!optimistic);
          const result = optimistic
            ? await leaveCommunityAction({ slug })
            : await joinCommunityAction({ slug });
          if (!result.ok) toast({ title: tAll(result.error.messageKey), tone: 'error' });
          router.refresh();
        });
      }}
    >
      {optimistic ? t('joined') : t('join')}
    </Button>
  );
}
