import { describe, expect, it } from 'vitest';

import { legalVersions } from '@/config/legal';
import { parseConsent, serializeConsent } from '@/lib/consent';

describe('cookie consent', () => {
  it('round-trips both choices', () => {
    expect(parseConsent(serializeConsent({ analytics: true }))).toEqual({ analytics: true });
    expect(parseConsent(serializeConsent({ analytics: false }))).toEqual({ analytics: false });
  });
  it('asks again when the Cookie Policy version changes or the value is junk', () => {
    expect(parseConsent(`v1.2020-01-01.a1`)).toBeNull();
    expect(parseConsent(`v1.${legalVersions.cookies}.yes`)).toBeNull();
    expect(parseConsent('')).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });
});
