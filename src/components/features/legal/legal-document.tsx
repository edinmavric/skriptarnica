import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Markdown } from '@/components/ui/markdown';
import { company } from '@/config/company';
import { ACCOUNT_DELETION_GRACE_DAYS, DATA_EXPORT_TTL_DAYS } from '@/config/notifications';
import { siteConfig } from '@/config/site';
import { formatDate, formatPrice } from '@/lib/format';
import { calculateCommission } from '@/lib/money';
import { pageMetadata } from '@/lib/seo/metadata';
import { getSettings } from '@/server/services/settings';

export type LegalDoc =
  'terms' | 'privacy' | 'cookies' | 'community' | 'seller' | 'refunds' | 'copyright';

interface Section {
  id: string;
  title: string;
  body: string;
}

/**
 * Legal texts (SPEC §7.4) from messages, with live values (commission, deadlines, company data)
 * filled in, so the documents never disagree with the code. ⚖️ Drafts until a lawyer reviews
 * them: the notice on top says so, and `[PRAVNIK: …]` marks open points.
 */
async function legalValues(): Promise<Record<string, string>> {
  const settings = await getSettings();
  return {
    site: siteConfig.name,
    company: company.legalName,
    address: company.address,
    email: company.email,
    legalEmail: company.legalEmail,
    privacyEmail: company.privacyEmail,
    commission: `${settings.commissionBasisPoints / 100}%`,
    sellerShare: `${100 - settings.commissionBasisPoints / 100}%`,
    holdDays: String(settings.fundsHoldDays),
    minPayout: formatPrice(settings.minPayoutPara),
    maxPrice: formatPrice(settings.maxNotePricePara),
    problemDays: String(settings.purchaseProblemWindowDays),
    graceDays: String(ACCOUNT_DELETION_GRACE_DAYS),
    exportDays: String(DATA_EXPORT_TTL_DAYS),
    copyrightDays: String(company.copyrightResponseDays),
    exampleSeller: formatPrice(
      calculateCommission(80_000, settings.commissionBasisPoints).sellerPara,
    ),
  };
}

function filler(values: Record<string, string>) {
  return (text: string) => text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/** Title and description for a legal page, with the same live values as the document. */
export async function legalMetadata(doc: LegalDoc, path: string): Promise<Metadata> {
  const t = await getTranslations('legal');
  const fill = filler(await legalValues());
  return pageMetadata({
    title: t(`${doc}.title`),
    description: fill(t.raw(`${doc}.intro`) as string)
      .replace(/\[PRAVNIK:[^\]]*\]/g, '')
      .trim(),
    path,
  });
}

export async function LegalDocument({ doc, version }: { doc: LegalDoc; version?: string }) {
  const t = await getTranslations('legal');
  const fill = filler(await legalValues());
  const intro = fill(t.raw(`${doc}.intro`) as string);
  const sections = (t.raw(`${doc}.sections`) as Section[]).map((section) => ({
    ...section,
    title: fill(section.title),
    body: fill(section.body),
  }));
  return (
    <article className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-display font-bold">{t(`${doc}.title`)}</h1>
        {version ? (
          <p className="text-sm text-ink-muted">{t('version', { date: formatDate(version) })}</p>
        ) : null}
        <p
          role="note"
          className="rounded-md border border-warning bg-warning-soft px-3 py-2 text-sm"
        >
          {t('draftNotice')}
        </p>
        {intro ? <p className="text-lg">{intro}</p> : null}
      </header>
      {sections.length > 3 ? (
        <nav aria-labelledby="toc-heading" className="rounded-md bg-paper-sunk p-4">
          <h2 id="toc-heading" className="mb-2 font-sans text-sm font-semibold">
            {t('contents')}
          </h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-pen underline underline-offset-2">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {sections.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-heading`}
          className="scroll-mt-20"
        >
          <h2 id={`${section.id}-heading`} className="mb-2 text-display-sm font-semibold">
            {index + 1}. {section.title}
          </h2>
          <Markdown source={section.body} className="legal-text" />
        </section>
      ))}
    </article>
  );
}
