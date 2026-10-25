'use client';

import * as Sentry from '@sentry/nextjs';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errorPages');
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-4 py-16"
    >
      <h1 className="text-display font-bold">{t('errorTitle')}</h1>
      <p className="text-ink-muted">{t('errorBody')}</p>
      {error.digest ? (
        <p className="font-mono text-sm text-ink-muted">
          {t('reference', { digest: error.digest })}
        </p>
      ) : null}
      <Button onClick={reset} className="self-start">
        {t('retry')}
      </Button>
    </main>
  );
}
