import { expect, test } from '@playwright/test';

import { expectNoSeriousA11yViolations } from './helpers';

test.describe('public catalog pages and search (Phase 3)', () => {
  test('landing, faculty, course and professor pages are accessible and linked', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Nađi skriptu');
    await expect(page.getByText(/Prodaš skriptu za 800 RSD → dobijaš 640 RSD/)).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page
      .getByRole('link', { name: /Elektrotehnički fakultet/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/f\/etf-bg$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Elektrotehnički fakultet' }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page
      .getByRole('link', { name: /Osnovi elektrotehnike 1/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/f\/etf-bg\/predmet\/osnovi-elektrotehnike-1$/);
    await expect(page.getByRole('navigation', { name: 'Putanja' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await expect(page.locator('script[type="application/ld+json"]').first()).toBeAttached();

    await page.getByRole('link', { name: /Petar Petrović/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Petar Petrović');
  });

  test('canonical and Open Graph metadata are present', async ({ page }) => {
    await page.goto('/f/etf-bg/predmet/osnovi-elektrotehnike-1');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/f\/etf-bg\/predmet\/osnovi-elektrotehnike-1$/,
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      /Osnovi elektrotehnike 1/,
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'sr-Latn');
  });

  for (const query of ['cacak', 'Čačak', 'Чачак']) {
    test(`search "${query}" finds FTN Čačak`, async ({ page }) => {
      await page.goto(`/pretraga?q=${encodeURIComponent(query)}`);
      const result = page.getByRole('link', { name: /Fakultet tehničkih nauka u Čačku/ });
      await expect(result).toBeVisible();
      await expect(result.locator('mark')).toHaveText('Čačku');
    });
  }

  test('search combobox suggests results and navigates with the keyboard', async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'the header search field is desktop-only; mobile uses /pretraga');
    await page.goto('/');
    await page.keyboard.press('Control+k');
    const box = page.getByRole('dialog').getByRole('combobox');
    await box.fill('oet');
    await expect(page.getByRole('option', { name: /Osnovi elektrotehnike 1/ })).toBeVisible();
    await box.press('ArrowDown');
    await box.press('Enter');
    await expect(page).toHaveURL(/\/predmet\//);
  });

  test('sitemap index lists segments and robots.txt points to it', async ({ request }) => {
    const index = await (await request.get('/sitemap.xml')).text();
    expect(index).toContain('/sitemaps/courses.xml');
    const courses = await (await request.get('/sitemaps/courses.xml')).text();
    expect(courses).toContain('/f/etf-bg/predmet/osnovi-elektrotehnike-1');
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Sitemap:');
  });

  test('unknown pages return a Serbian 404', async ({ page }) => {
    const response = await page.goto('/f/ne-postoji');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Ova stranica ne postoji' })).toBeVisible();
  });
});
