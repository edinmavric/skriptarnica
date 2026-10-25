import { getTranslations } from 'next-intl/server';

import { formatDateTime } from '@/lib/format';
import { readDevOutbox } from '@/server/email/transport';

export const dynamic = 'force-dynamic';

export default async function DevOutboxPage() {
  const t = await getTranslations('devOutbox');
  const entries = await readDevOutbox();
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="mt-2 text-ink-muted">{t('intro')}</p>
      {entries.length === 0 ? <p className="mt-6">{t('empty')}</p> : null}
      <ol className="mt-6 flex flex-col gap-4">
        {entries.map((entry) => {
          const links = [...entry.html.matchAll(/href="([^"]+)"/g)].map(
            (m) => m[1]?.replace(/&amp;/g, '&') ?? '',
          );
          return (
            <li key={entry.id} className="rounded-md border border-rule bg-paper-raised p-4">
              <p className="text-sm text-ink-muted">
                {formatDateTime(entry.createdAt)} — {entry.to}
              </p>
              <h2 className="mt-1 font-sans text-lg font-semibold">{entry.subject}</h2>
              <pre className="mt-2 font-sans text-sm whitespace-pre-wrap text-ink-muted">
                {entry.text}
              </pre>
              <ul className="mt-2 flex flex-col gap-1">
                {[...new Set(links)].map((link) => (
                  <li key={link}>
                    <a href={link} className="text-sm break-all text-pen underline">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
