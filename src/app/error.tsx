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
    // A single ruled sheet on the notebook cover (no site chrome here).
    <div className="desk min-h-dvh px-3 py-10 sm:py-16">
      <main
        id="main"
        data-paper="ruled"
        className="sheet mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-5 py-14 md:pl-16"
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
    </div>
  );
}
