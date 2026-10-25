'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { removeAvatarAction, uploadAvatarAction } from '@/server/actions/account';

export function AvatarForm({ name, image }: { name: string; image: string | null }) {
  const t = useTranslations('settings.account');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <FormAlert message={error} />
      <div className="flex items-center gap-4">
        <Avatar name={name} src={image} size="lg" />
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            id="avatar-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic"
            className="sr-only"
            aria-label={t('avatarUpload')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const data = new FormData();
              data.set('avatar', file);
              setError(null);
              startTransition(async () => {
                const result = await uploadAvatarAction(data);
                if (input.current) input.current.value = '';
                if (!result.ok)
                  setError(tAll(result.error.fieldErrors?.avatar?.[0] ?? result.error.messageKey));
                else router.refresh();
              });
            }}
          />
          <Button variant="secondary" loading={pending} onClick={() => input.current?.click()}>
            {image ? t('avatarChange') : t('avatarUpload')}
          </Button>
          {image ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await removeAvatarAction({});
                  router.refresh();
                })
              }
            >
              {t('avatarRemove')}
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-sm text-ink-muted">{t('avatarHint')}</p>
    </div>
  );
}
