'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { routes } from '@/config/routes';
import type { ConsentState } from '@/lib/consent';
import { saveCookieConsentAction } from '@/server/actions/consent';

import { Analytics } from './analytics';

// Dialog + switch code loads only when someone opens the settings.
const CookieSettingsDialog = dynamic(() => import('./cookie-settings-dialog'), { ssr: false });

export const OPEN_COOKIE_SETTINGS = 'skr:open-cookie-settings';

/**
 * Banner with a real choice (SPEC §7.2): "Prihvati sve" and "Odbij" with equal weight, plus
 * settings. Analytics loads only after an explicit yes, never before.
 */
export function CookieConsent({ initial }: { initial: ConsentState | null }) {
  const t = useTranslations('consent');
  const [consent, setConsent] = useState(initial);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Element that opened the settings (footer link or banner button), to refocus on close.
  const opener = useRef<HTMLElement | null>(null);
  const openSettings = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSettingsLoaded(true);
    setSettingsOpen(true);
  };
  const changeSettingsOpen = (value: boolean) => {
    setSettingsOpen(value);
    if (!value)
      requestAnimationFrame(() =>
        opener.current?.isConnected
          ? opener.current.focus()
          : document.getElementById('main')?.focus(),
      );
  };
  const [analytics, setAnalytics] = useState(initial?.analytics ?? false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const open = () => {
      setAnalytics(consent?.analytics ?? false);
      openSettings();
    };
    window.addEventListener(OPEN_COOKIE_SETTINGS, open);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS, open);
  }, [consent]);

  const choose = (value: boolean) =>
    startTransition(async () => {
      const result = await saveCookieConsentAction({ analytics: value });
      if (result.ok) {
        setConsent({ analytics: value });
        changeSettingsOpen(false);
      }
    });

  return (
    <>
      <Analytics enabled={consent?.analytics === true} />
      {consent === null ? (
        <section
          aria-labelledby="cookie-banner-title"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-rule-strong bg-paper-raised px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.08)] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-md sm:rounded-lg sm:border"
        >
          <h2 id="cookie-banner-title" className="font-sans text-base font-semibold">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t('text')}{' '}
            <Link href={routes.legal.cookies} className="text-pen underline underline-offset-2">
              {t('policy')}
            </Link>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {/* Equal weight: same size and style for both choices. */}
            <Button variant="secondary" loading={pending} onClick={() => choose(false)}>
              {t('reject')}
            </Button>
            <Button variant="secondary" loading={pending} onClick={() => choose(true)}>
              {t('accept')}
            </Button>
          </div>
          <button
            type="button"
            className="mt-2 min-h-11 text-sm text-pen underline underline-offset-2"
            onClick={() => {
              setAnalytics(false);
              openSettings();
            }}
          >
            {t('customize')}
          </button>
        </section>
      ) : null}
      {settingsLoaded ? (
        <CookieSettingsDialog
          open={settingsOpen}
          onOpenChange={changeSettingsOpen}
          analytics={analytics}
          onAnalyticsChange={setAnalytics}
          pending={pending}
          onSave={() => choose(analytics)}
        />
      ) : null}
    </>
  );
}

/** Footer entry point ("Podešavanja kolačića"). */
export function CookieSettingsButton() {
  const t = useTranslations('consent');
  return (
    <button
      type="button"
      className="inline-block py-1.5 text-sm text-ink-muted hover:text-ink hover:underline"
      onClick={() => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS))}
    >
      {t('footerLink')}
    </button>
  );
}
