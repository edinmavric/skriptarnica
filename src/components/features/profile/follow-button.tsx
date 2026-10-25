'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useOptimistic, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { routes } from '@/config/routes';
import { followAction } from '@/server/actions/account';

export function FollowButton({
  sellerId,
  following,
  signedIn,
}: {
  sellerId: string;
  following: boolean;
  signedIn: boolean;
}) {
  const t = useTranslations('profile');
  const router = useRouter();
  const pathname = usePathname();
  const [optimistic, setOptimistic] = useOptimistic(following);
  const [pending, startTransition] = useTransition();
  if (!signedIn)
    return (
      <Button asChild variant="secondary">
        <Link href={`${routes.signIn}?next=${encodeURIComponent(pathname)}`}>{t('follow')}</Link>
      </Button>
    );
  return (
    <Button
      variant={optimistic ? 'secondary' : 'primary'}
      aria-pressed={optimistic}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await followAction({ targetType: 'seller', targetId: sellerId, follow: !optimistic });
          router.refresh();
        })
      }
    >
      {optimistic ? t('following') : t('follow')}
    </Button>
  );
}
