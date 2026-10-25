import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { CookieSettingsButton } from '@/components/features/consent/cookie-consent';
import { routes } from '@/config/routes';
import { siteConfig } from '@/config/site';

/** Footer with every legal page (SPEC §7.4) and the cookie settings entry point (SPEC §7.2). */
export async function SiteFooter({
  cookieSettings,
  paymentNotice,
}: {
  cookieSettings?: ReactNode;
  paymentNotice?: ReactNode;
}) {
  const t = await getTranslations('layout.footer');
  const groups = [
    {
      title: t('product'),
      links: [
        [routes.howItWorks, t('howItWorks')],
        [routes.commission, t('commission')],
        [routes.faq, t('faq')],
        [routes.contact, t('contact')],
      ],
    },
    {
      title: t('rules'),
      links: [
        [routes.legal.terms, t('terms')],
        [routes.legal.community, t('communityGuidelines')],
        [routes.legal.seller, t('sellerTerms')],
        [routes.legal.refunds, t('refunds')],
      ],
    },
    {
      title: t('privacy'),
      links: [
        [routes.legal.privacy, t('privacyPolicy')],
        [routes.legal.cookies, t('cookiePolicy')],
        [routes.legal.copyright, t('copyright')],
        [routes.legal.imprint, t('imprint')],
      ],
    },
  ] as const;
  return (
    <footer className="mt-16 border-t border-rule bg-paper-sunk pb-24 md:pb-8">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="font-sans text-sm font-semibold text-ink">{group.title}</h2>
            <ul className="mt-3 flex flex-col gap-1">
              {group.links.map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-block py-1.5 text-sm text-ink-muted hover:text-ink hover:underline"
                  >
                    {label}
                  </Link>
                </li>
              ))}
              {group.title === t('privacy') ? (
                <li>{cookieSettings ?? <CookieSettingsButton />}</li>
              ) : null}
            </ul>
          </div>
        ))}
      </div>
      {paymentNotice ? <div className="mx-auto max-w-6xl px-4 sm:px-6">{paymentNotice}</div> : null}
      <p className="mx-auto max-w-6xl px-4 pt-4 text-sm text-ink-muted sm:px-6">
        {t('copyrightLine', { year: new Date().getFullYear(), name: siteConfig.name })}
      </p>
    </footer>
  );
}
