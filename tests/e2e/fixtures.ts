import { test as base, expect } from '@playwright/test';

import { legalVersions } from '../../src/config/legal';

const baseURL = new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000');

/**
 * Every browser context in the suite starts with "analytics rejected" so the cookie banner
 * doesn't cover the page. Flow 8 (the banner itself) clears it with `withoutConsent`.
 */
export const consentCookie = {
  name: 'skr_consent',
  value: `v1.${legalVersions.cookies}.a0`,
  domain: baseURL.hostname,
  path: '/',
  sameSite: 'Lax' as const,
};

export const test = base.extend<{ withoutConsent: boolean }>({
  withoutConsent: [false, { option: true }],
  context: async ({ context, withoutConsent }, provide) => {
    // The browser wrapper below already added the cookie; flow 8 removes it again.
    if (withoutConsent) await context.clearCookies({ name: consentCookie.name });
    await provide(context);
  },
  browser: [
    async ({ browser }, provide) => {
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options);
        await context.addCookies([consentCookie]);
        return context;
      };
      await provide(browser);
    },
    { scope: 'worker' },
  ],
});

export { expect };
