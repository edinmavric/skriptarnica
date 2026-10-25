import type { Page, Request } from '@playwright/test';

import { expectNoSeriousA11yViolations } from './helpers';
import { expect, test } from './fixtures';

// These tests start without the suite's default consent cookie.
test.use({ withoutConsent: true });

function analyticsRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/dev/analytics')) seen.push(request);
  });
  return seen;
}

test.describe('flow 8: cookie banner and consent-gated analytics', () => {
  test('nothing is sent before a choice or after "Odbij"; both choices weigh the same', async ({
    page,
  }) => {
    const sent = analyticsRequests(page);
    await page.goto('/');
    const banner = page.getByRole('region', { name: 'Kolačići' });
    await expect(banner).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    const accept = banner.getByRole('button', { name: 'Prihvati sve' });
    const reject = banner.getByRole('button', { name: 'Odbij' });
    expect(await accept.getAttribute('class')).toBe(await reject.getAttribute('class'));
    const [a, r] = [await accept.boundingBox(), await reject.boundingBox()];
    expect(Math.round(a?.width ?? 0)).toBe(Math.round(r?.width ?? -1));

    await page.goto('/pretraga?q=oet');
    await page.waitForLoadState('networkidle');
    expect(sent).toHaveLength(0);

    await page.goto('/');
    await page
      .getByRole('region', { name: 'Kolačići' })
      .getByRole('button', { name: 'Odbij' })
      .click();
    await expect(page.getByRole('region', { name: 'Kolačići' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Kolačići' })).toHaveCount(0);
    await page.goto('/zajednice');
    await page.waitForLoadState('networkidle');
    expect(sent).toHaveLength(0);
    const cookie = (await page.context().cookies()).find((c) => c.name === 'skr_consent');
    expect(cookie?.value).toMatch(/\.a0$/);
  });

  test('"Prihvati sve" loads analytics; the footer link changes the choice back', async ({
    page,
  }) => {
    const sent = analyticsRequests(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(sent).toHaveLength(0);
    await page
      .getByRole('region', { name: 'Kolačići' })
      .getByRole('button', { name: 'Prihvati sve' })
      .click();
    await expect.poll(() => sent.length, { timeout: 15_000 }).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Podešavanja kolačića' }).click();
    const dialog = page.getByRole('dialog', { name: 'Podešavanja kolačića' });
    await expect(dialog.getByRole('switch', { name: 'Analitički' })).toBeChecked();
    await expect(dialog.getByRole('switch', { name: 'Neophodni' })).toBeDisabled();
    await dialog.getByRole('switch', { name: 'Analitički' }).click();
    await dialog.getByRole('button', { name: 'Sačuvaj izbor' }).click();
    await expect(dialog).toBeHidden();
    const cookie = (await page.context().cookies()).find((c) => c.name === 'skr_consent');
    expect(cookie?.value).toMatch(/\.a0$/);

    // A fresh visit with the withdrawn consent loads nothing.
    const fresh = await page.context().newPage();
    const freshSent = analyticsRequests(fresh);
    await fresh.goto('/zajednice');
    await fresh.waitForLoadState('networkidle');
    expect(freshSent).toHaveLength(0);
  });

  test('"Podešavanja" in the banner lets you choose analytics only explicitly', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .getByRole('region', { name: 'Kolačići' })
      .getByRole('button', { name: 'Podešavanja' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Podešavanja kolačića' });
    // Off by default (no pre-ticked boxes).
    await expect(dialog.getByRole('switch', { name: 'Analitički' })).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Sačuvaj izbor' }).click();
    await expect(page.getByRole('region', { name: 'Kolačići' })).toHaveCount(0);
  });
});
