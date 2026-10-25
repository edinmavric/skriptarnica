'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { authClient } from '@/lib/auth-client';
import {
  revokeOtherSessionsAction,
  revokeSessionAction,
  unlinkGoogleAction,
} from '@/server/actions/account';

export function RevokeSessionButton({ sessionId, label }: { sessionId: string; label: string }) {
  const t = useTranslations('settings.sessions');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      aria-label={`${t('revoke')}: ${label}`}
      onClick={() =>
        startTransition(async () => {
          await revokeSessionAction({ sessionId });
          router.refresh();
        })
      }
    >
      {t('revoke')}
    </Button>
  );
}

export function RevokeOthersButton() {
  const t = useTranslations('settings.sessions');
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      className="self-start"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await revokeOtherSessionsAction({});
          toast({ title: t('othersRevoked'), tone: 'success' });
          router.refresh();
        })
      }
    >
      {t('revokeOthers')}
    </Button>
  );
}

export function GoogleLinkButton({ linked }: { linked: boolean }) {
  const t = useTranslations('settings.linked');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  if (linked)
    return (
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await unlinkGoogleAction({});
            if (!result.ok) toast({ title: tAll(result.error.messageKey), tone: 'error' });
            router.refresh();
          })
        }
      >
        {t('unlink')}
      </Button>
    );
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          await authClient.linkSocial({
            provider: 'google',
            callbackURL: '/podesavanja/bezbednost',
          });
        })
      }
    >
      {t('link')}
    </Button>
  );
}
