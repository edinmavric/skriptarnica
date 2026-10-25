'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * Last-resort boundary when the root layout itself fails: no providers (and so no i18n) are
 * available here, so the copy is inlined in Serbian.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="sr-Latn">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          background: '#fbfaf5',
          color: '#1b1d22',
          padding: '4rem 1rem',
        }}
      >
        <main style={{ maxWidth: 560, margin: '0 auto' }}>
          <h1>Nešto nije u redu</h1>
          <p>Stranica nije mogla da se učita. Pokušaj ponovo za minut.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 16px' }}>
            Pokušaj ponovo
          </button>
        </main>
      </body>
    </html>
  );
}
