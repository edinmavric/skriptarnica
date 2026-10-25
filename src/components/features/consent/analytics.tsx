'use client';

import { usePathname } from 'next/navigation';
import type { PostHog } from 'posthog-js';
import { useEffect, useRef } from 'react';

/**
 * PostHog, loaded only after analytics consent (SPEC §7.2): the library isn't even downloaded
 * before. Pageviews only (no autocapture, no session recording, no external scripts); a
 * withdrawn consent opts out and clears its storage.
 */
export function Analytics({ enabled }: { enabled: boolean }) {
  const client = useRef<PostHog | null>(null);
  const pathname = usePathname();
  // Read directly (inlined at build; validated by src/env.ts on the server). Importing '@/env'
  // here would ship zod to every page.
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  useEffect(() => {
    if (!key || !host) return;
    if (!enabled) {
      if (client.current) {
        client.current.opt_out_capturing();
        client.current.reset();
      }
      return;
    }
    let cancelled = false;
    void import('posthog-js').then(({ default: posthog }) => {
      if (cancelled) return;
      if (!client.current) {
        posthog.init(key, {
          api_host: host,
          autocapture: false,
          capture_pageview: false,
          capture_pageleave: false,
          disable_session_recording: true,
          disable_surveys: true,
          disable_external_dependency_loading: true,
          person_profiles: 'identified_only',
          persistence: 'localStorage+cookie',
        });
      }
      posthog.opt_in_capturing();
      client.current = posthog;
      posthog.capture('$pageview');
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, host]);

  // Later client-side navigations (the first pageview is sent right after loading).
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (enabled && client.current) client.current.capture('$pageview');
  }, [enabled, pathname]);

  return null;
}
