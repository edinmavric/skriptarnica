import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { company, companyIsPlaceholder } from '@/config/company';
import { routes } from '@/config/routes';
import { pageMetadata } from '@/lib/seo/metadata';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('imprint');
  return pageMetadata({ title: t('title'), description: t('intro'), path: routes.legal.imprint });
}

/** Imprint (SPEC §7.4, ⚖️ Law on Electronic Commerce): read from config/company.ts. */
export default async function ImprintPage() {
  const t = await getTranslations('imprint');
  const rows = [
    ['legalName', company.legalName],
    ['address', company.address],
    ['registrationNumber', company.registrationNumber],
    ['taxId', company.taxId],
    ['register', company.register],
    ['email', company.email],
    ['legalEmail', company.legalEmail],
    ['privacyEmail', company.privacyEmail],
    ['phone', company.phone],
  ] as const;
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-display font-bold">{t('title')}</h1>
      <p className="text-ink-muted">{t('intro')}</p>
      {companyIsPlaceholder ? (
        <p
          role="note"
          className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm"
        >
          {t('placeholder')}
        </p>
      ) : null}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[14rem_1fr]">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-ink-muted">{t(key)}</dt>
            <dd>
              {value.includes('@') ? (
                <a href={`mailto:${value}`} className="text-pen underline underline-offset-2">
                  {value}
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
