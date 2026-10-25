import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { CommunityActivity } from '@/components/features/feed/community-activity';
import { HomeFeed } from '@/components/features/feed/home-feed';
import { LandingSearch } from '@/components/features/landing/landing-search';
import { JsonLd } from '@/components/seo/json-ld';
import { Button } from '@/components/ui/button';
import { defaults, PARA_PER_RSD } from '@/config/constants';
import { routes } from '@/config/routes';
import { siteConfig } from '@/config/site';
import { env } from '@/env';
import { formatPrice } from '@/lib/format';
import { calculateCommission } from '@/lib/money';
import { pageMetadata } from '@/lib/seo/metadata';
import { redirect } from 'next/navigation';

import { getCurrentUser, hasCurrentConsents } from '@/server/auth/session';
import { listFacultiesForPicker } from '@/server/services/catalog-pages';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing');
  return {
    ...pageMetadata({
      title: t('metaTitle'),
      description: t('metaDescription'),
      path: routes.home,
    }),
    title: { absolute: `${siteConfig.name} — ${t('metaTitle')}` },
  };
}

const EXAMPLE_PRICE_PARA = 800 * PARA_PER_RSD;

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    if (!(await hasCurrentConsents(user.id))) redirect(`${routes.acceptTerms}?next=%2F`);
    return <HomeFeed user={user} communityActivity={<CommunityActivity user={user} />} />;
  }
  return <Landing />;
}

async function Landing() {
  const t = await getTranslations('landing');
  const faculties = await listFacultiesForPicker();
  const example = calculateCommission(EXAMPLE_PRICE_PARA, defaults.platformCommissionBasisPoints);

  return (
    <div className="flex flex-col gap-16">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: siteConfig.name,
          url: env.NEXT_PUBLIC_APP_URL,
        }}
      />

      <section
        aria-labelledby="hero-title"
        className="grid items-start gap-10 pt-2 lg:grid-cols-[1.25fr_1fr] lg:pt-6"
      >
        <div className="flex flex-col gap-6">
          <h1
            id="hero-title"
            className="text-display-lg font-bold sm:text-[3.5rem] sm:leading-[1.02]"
          >
            {t.rich('title', { mark: (chunks) => <span className="marker">{chunks}</span> })}
          </h1>
          <p className="max-w-[46ch] text-lg text-ink-muted">{t('lead')}</p>
          <LandingSearch faculties={faculties} />
          <p className="text-sm text-ink-muted">{t('searchHint')}</p>
        </div>

        {/* A worked example rather than a mockup: what a listing actually tells you. */}
        <figure className="paper-sheet rounded-sm p-5 pb-6" aria-labelledby="example-caption">
          <figcaption id="example-caption" className="mb-3 text-sm text-ink-muted">
            {t('example.caption')}
          </figcaption>
          <p className="font-display text-xl leading-snug font-semibold">{t('example.title')}</p>
          <p className="mt-1 text-sm text-ink-muted">{t('example.meta')}</p>
          <div className="notebook mt-4 text-[0.95rem] [&>*+*]:!mt-0">
            <p>{t('example.line1')}</p>
            <p>{t('example.line2')}</p>
            <p>{t('example.line3')}</p>
          </div>
        </figure>
      </section>

      <section
        aria-labelledby="paths-title"
        className="grid gap-8 border-t border-rule pt-10 md:grid-cols-2"
      >
        <h2 id="paths-title" className="sr-only">
          {t('paths.title')}
        </h2>
        <div>
          <h3 className="text-display-sm font-semibold">{t('paths.buyTitle')}</h3>
          <ol className="mt-4 flex flex-col gap-3">
            {(['buy1', 'buy2', 'buy3', 'buy4'] as const).map((key, index) => (
              <li key={key} className="flex gap-3">
                <span className="tabular mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] border-ink text-sm font-semibold">
                  {index + 1}
                </span>
                <span>{t(`paths.${key}`)}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="text-display-sm font-semibold">{t('paths.sellTitle')}</h3>
          <ol className="mt-4 flex flex-col gap-3">
            {(['sell1', 'sell2', 'sell3', 'sell4'] as const).map((key, index) => (
              <li key={key} className="flex gap-3">
                <span className="tabular mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-[1.5px] border-ink text-sm font-semibold">
                  {index + 1}
                </span>
                <span>{t(`paths.${key}`)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="sell-title" className="rounded-lg bg-paper-sunk px-5 py-8 sm:px-8">
        <h2 id="sell-title" className="text-display font-bold">
          {t('sell.title')}
        </h2>
        <p className="mt-4 font-display text-2xl">
          {t.rich('sell.math', {
            price: formatPrice(EXAMPLE_PRICE_PARA),
            seller: formatPrice(example.sellerPara),
            mark: (chunks) => <span className="marker tabular font-semibold">{chunks}</span>,
          })}
        </p>
        <p className="mt-3 max-w-prose text-ink-muted">
          {t('sell.explain', {
            percent: defaults.platformCommissionPercent,
            commission: formatPrice(example.commissionPara),
            days: defaults.fundsHoldDays,
          })}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={routes.becomeSeller}>{t('sell.cta')}</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={routes.commission}>{t('sell.more')}</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="faculties-title">
        <h2 id="faculties-title" className="text-display-sm font-semibold">
          {t('faculties.title')}
        </h2>
        <ul className="mt-4 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {faculties.map((faculty) => (
            <li key={faculty.slug}>
              <Link
                href={routes.faculty(faculty.slug)}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-rule py-2 hover:bg-paper-sunk"
              >
                <span>{faculty.name}</span>
                <span className="text-sm whitespace-nowrap text-ink-muted">{faculty.city}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
