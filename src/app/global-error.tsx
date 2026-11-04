'use client';

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
    // Loaded only when an error is shown: error boundaries ship with every page, and a static
    // import put the Sentry core into every page's first-load JS (SPEC §8.2 budget).
    void import('@sentry/nextjs').then((Sentry) => Sentry.captureException(error));
  }, [error]);
  return (
    <html lang="sr-Latn">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          background: '#fbfcff',
          color: '#151b33',
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
