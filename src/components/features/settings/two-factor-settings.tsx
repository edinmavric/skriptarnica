'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  confirmTwoFactorAction,
  disableTwoFactorAction,
  startTwoFactorAction,
} from '@/server/actions/security';

type Stage =
  | { kind: 'idle' }
  | { kind: 'enroll'; qrSvg: string; secret: string; backupCodes: string[] }
  | { kind: 'done'; backupCodes: string[] };

export function TwoFactorSettings({
  enabled,
  isAdmin,
  hasPassword,
}: {
  enabled: boolean;
  isAdmin: boolean;
  hasPassword: boolean;
}) {
  const t = useTranslations('settings.security');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fail = (key: string) => setError(tAll(key));

  if (!hasPassword) return <FormAlert message={t('needsPassword')} />;

  if (stage.kind === 'done') {
    return (
      <div className="flex max-w-lg flex-col gap-3">
        <FormAlert tone="success" message={t('enabledNow')} />
        <p className="font-medium">{t('backupCodes')}</p>
        <p className="text-sm text-ink-muted">{t('backupCodesHint')}</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm" aria-label={t('backupCodes')}>
          {stage.backupCodes.map((backup) => (
            <li key={backup} className="rounded-sm bg-paper-sunk px-2 py-1">
              {backup}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (stage.kind === 'enroll') {
    return (
      <div className="flex max-w-lg flex-col gap-4">
        <p>{t('scan')}</p>
        {/* SVG generated server-side by the qrcode library from the TOTP URI. */}
        <div
          className="w-48 rounded-md bg-white p-2"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: stage.qrSvg }}
        />
        <p className="text-sm text-ink-muted">
          {t('manual')}{' '}
          <code className="font-mono break-all text-ink" data-testid="totp-secret">
            {stage.secret}
          </code>
        </p>
        <FormAlert message={error} />
        <Field label={t('code')}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <Button
          className="self-start"
          loading={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await confirmTwoFactorAction({ code });
              if (result.ok) {
                setStage({ kind: 'done', backupCodes: stage.backupCodes });
                router.refresh();
              } else fail(result.error.fieldErrors?.code?.[0] ?? result.error.messageKey);
            })
          }
        >
          {t('confirm')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <p className="flex items-center gap-2">
        {t('status')}{' '}
        <Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? t('on') : t('off')}</Badge>
      </p>
      {isAdmin && !enabled ? <FormAlert message={t('adminRequired')} /> : null}
      <FormAlert message={error} />
      {enabled && isAdmin ? (
        <p className="text-sm text-ink-muted">{t('adminCannotDisable')}</p>
      ) : (
        <>
          <Field label={t('password')} description={enabled ? t('disableHint') : t('enableHint')}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button
            variant={enabled ? 'danger' : 'primary'}
            className="self-start"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                if (enabled) {
                  const result = await disableTwoFactorAction({ password });
                  if (result.ok) router.refresh();
                  else fail(result.error.fieldErrors?.password?.[0] ?? result.error.messageKey);
                } else {
                  const result = await startTwoFactorAction({ password });
                  if (result.ok) setStage({ kind: 'enroll', ...result.value });
                  else fail(result.error.fieldErrors?.password?.[0] ?? result.error.messageKey);
                }
              })
            }
          >
            {enabled ? t('disable') : t('enable')}
          </Button>
        </>
      )}
    </div>
  );
}
