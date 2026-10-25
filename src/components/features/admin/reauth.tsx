'use client';

import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { Result } from '@/lib/result';
import { reauthAction } from '@/server/actions/admin-panel';

type Runner = <T>(run: () => Promise<Result<T>>) => Promise<Result<T>>;

const ReauthContext = createContext<Runner | null>(null);

const REAUTH_KEY = 'errors.admin.reauthRequired';

/**
 * Sensitive admin actions answer "re-authentication required" when the password wasn't
 * confirmed in the last 10 minutes; this asks for it and retries the action once.
 */
export function ReauthProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('admin.reauth');
  const tAll = useTranslations() as unknown as (key: string) => string;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const waiter = useRef<((confirmed: boolean) => void) | null>(null);

  const ask = () =>
    new Promise<boolean>((resolve) => {
      waiter.current = resolve;
      setPassword('');
      setError(null);
      setOpen(true);
    });

  const run = useCallback<Runner>(async (action) => {
    const first = await action();
    if (first.ok || first.error.messageKey !== REAUTH_KEY) return first;
    return (await ask()) ? action() : first;
  }, []);

  const finish = (confirmed: boolean) => {
    setOpen(false);
    waiter.current?.(confirmed);
    waiter.current = null;
  };

  return (
    <ReauthContext.Provider value={run}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) finish(false);
        }}
        title={t('title')}
        description={t('description')}
        footer={
          <Button
            loading={pending}
            disabled={!password}
            onClick={async () => {
              setPending(true);
              const result = await reauthAction({ password });
              setPending(false);
              if (result.ok) finish(true);
              else
                setError(tAll(result.error.fieldErrors?.password?.[0] ?? result.error.messageKey));
            }}
          >
            {t('confirm')}
          </Button>
        }
      >
        <form onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-3">
          <FormAlert message={error} />
          <Field label={t('password')} required>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </Field>
        </form>
      </Dialog>
    </ReauthContext.Provider>
  );
}

export function useReauth(): Runner {
  const run = useContext(ReauthContext);
  if (!run) throw new Error('useReauth outside ReauthProvider');
  return run;
}
