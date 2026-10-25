import { legalVersions } from '@/config/legal';

/**
 * Cookie consent (SPEC §7.2): necessary cookies always, analytics opt-in, no marketing cookies.
 * The choice is stored in a first-party cookie, tied to the Cookie Policy version: a new version
 * asks again.
 */
export const CONSENT_COOKIE = 'skr_consent';
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365;

export interface ConsentState {
  analytics: boolean;
}

export function serializeConsent(state: ConsentState): string {
  return `v1.${legalVersions.cookies}.${state.analytics ? 'a1' : 'a0'}`;
}

/** null = no (current) choice yet → show the banner. */
export function parseConsent(value: string | undefined | null): ConsentState | null {
  if (!value) return null;
  const [format, version, analytics] = value.split('.');
  if (format !== 'v1' || version !== legalVersions.cookies) return null;
  if (analytics !== 'a1' && analytics !== 'a0') return null;
  return { analytics: analytics === 'a1' };
}
