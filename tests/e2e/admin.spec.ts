import { expect, test, type Browser, type Page } from '@playwright/test';

import { expectNoSeriousA11yViolations } from './helpers';
import {
  confirmReauth,
  enableTwoFactor,
  grantAdmin,
  newTestUser,
  signIn,
  signUpAndVerify,
  type TestUser,
} from './support';

async function adminSession(browser: Browser): Promise<{ page: Page; admin: TestUser }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const admin = newTestUser('panel');
  await signUpAndVerify(page, admin);
  grantAdmin(admin.email);
  await enableTwoFactor(page, admin.password);
  return { page, admin };
}

async function findUser(page: Page, user: TestUser) {
  await page.goto(`/admin/korisnici?q=${encodeURIComponent(user.email)}`);
  await page.getByRole('link', { name: user.username }).click();
  await expect(page.getByRole('heading', { level: 1, name: user.name })).toBeVisible();
}

test.describe('admin panel (Phase 9)', () => {
  test('an admin without 2FA is sent to enable it; a student gets a 404', async ({ page }) => {
    const user = newTestUser('no2fa');
    await signUpAndVerify(page, user);
    expect((await page.request.get('/admin')).status()).toBe(404);
    grantAdmin(user.email);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/podesavanja\/bezbednost\?admin=1/);
    // Server Actions are guarded too, not only the pages.
    expect(
      (
        await page.request.get(
          '/admin/izvestaji/preuzmi?vrsta=porudzbine&od=2026-01-01&do=2026-01-31',
        )
      ).status(),
    ).toBe(404);
  });

  test('dashboard and every section render accessibly', async ({ browser }) => {
    test.setTimeout(120_000);
    const { page } = await adminSession(browser);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { level: 1, name: 'Pregled' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Prodaje po danima (poslednjih 30 dana)' }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    for (const [path, heading] of [
      ['/admin/korisnici', 'Korisnici'],
      ['/admin/katalog', 'Katalog'],
      ['/admin/katalog/zahtevi', 'Predlozi za katalog'],
      ['/admin/katalog/uvoz', 'Uvoz predmeta iz CSV-a'],
      ['/admin/prijave', 'Prijave'],
      ['/admin/autorska-prava', 'Povrede autorskih prava'],
      ['/admin/porudzbine', 'Porudžbine'],
      ['/admin/izvestaji', 'Izveštaji (CSV)'],
      ['/admin/podesavanja', 'Podešavanja platforme'],
      ['/admin/dnevnik', 'Dnevnik izmena'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expectNoSeriousA11yViolations(page);
      // No sideways page scroll on phones (the long admin nav scrolls by itself).
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    }
    // CSV export downloads with a BOM and a header row.
    const csv = await page.request.get(
      '/admin/izvestaji/preuzmi?vrsta=porudzbine&od=2026-01-01&do=2026-12-31',
    );
    expect(csv.headers()['content-type']).toContain('text/csv');
    expect((await csv.text()).replace(/^﻿/, '').split('\r\n')[0]).toContain('order_id');
  });

  test('ban needs re-authentication, blocks sign-in, and is in the audit log', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const victimCtx = await browser.newContext();
    const victimPage = await victimCtx.newPage();
    const victim = newTestUser('blok', 'Blokirani Korisnik');
    await signUpAndVerify(victimPage, victim);

    const { page, admin } = await adminSession(browser);
    await findUser(page, victim);
    await page.getByRole('button', { name: 'Blokiraj nalog' }).click();
    await page
      .getByRole('dialog')
      .getByLabel(/^Razlog/)
      .fill('Lažne prijave i spam.');
    await page.getByRole('dialog').getByRole('button', { name: 'Blokiraj' }).click();
    await confirmReauth(page, admin.password);
    await expect(page.getByText('Nalog je blokiran.').first()).toBeVisible();
    await expect(page.getByText(/^Blokiran od/)).toBeVisible();

    // The victim's existing session is gone and signing in is refused.
    await victimPage.goto('/podesavanja');
    await expect(victimPage).toHaveURL(/\/prijava/);
    await signIn(victimPage, victim);
    await expect(victimPage.getByText('Nalog je suspendovan.')).toBeVisible();

    // Within 10 minutes no second password prompt.
    await page.getByRole('button', { name: 'Ukini blokadu' }).click();
    await expect(page.getByText('Blokada je ukinuta.').first()).toBeVisible();
    await page.goto(`/admin/dnevnik?ko=${encodeURIComponent(admin.email)}`);
    await expect(page.getByRole('cell', { name: 'user.banned' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'user.unbanned' })).toBeVisible();
    await victimCtx.close();
  });

  test('read-only impersonation shows a banner, refuses changes, and ends back in the admin', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const targetCtx = await browser.newContext();
    const targetPage = await targetCtx.newPage();
    const target = newTestUser('gledan', 'Gledani Student');
    await signUpAndVerify(targetPage, target);
    await targetCtx.close();

    const { page, admin } = await adminSession(browser);
    await findUser(page, target);
    await page.getByRole('button', { name: 'Pogledaj sajt kao ovaj korisnik' }).click();
    await confirmReauth(page, admin.password);
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByText('Pregledaš sajt kao Gledani Student. Samo čitanje: izmene nisu moguće.'),
    ).toBeVisible();

    await page.goto('/podesavanja');
    await page.getByLabel(/^O meni/).fill('Admin ne sme ovo da sačuva.');
    await page.getByRole('button', { name: 'Sačuvaj' }).click();
    await expect(page.getByText('Pregled tuđeg naloga je samo za čitanje.')).toBeVisible();
    // The admin area isn't reachable as the user.
    expect((await page.request.get('/admin')).status()).toBe(404);

    await page.getByRole('button', { name: 'Završi pregled' }).click();
    await expect(page).toHaveURL(/\/admin\/korisnici\//);
    await expect(page.getByRole('heading', { level: 1, name: 'Gledani Student' })).toBeVisible();
    await expect(page.getByText('user.impersonation_started')).toBeVisible();
    await expect(page.getByText('user.impersonation_ended')).toBeVisible();
  });

  test('catalog: create a course (gets a community), CSV preview, settings change audited', async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const { page, admin } = await adminSession(browser);
    const name = `Admin predmet ${Date.now().toString(36)}`;
    await page.goto('/admin/katalog/course/novi');
    await page
      .getByLabel(/^Fakultet/)
      .selectOption({ label: 'Elektrotehnički fakultet (ETF, Beograd)' });
    await page.getByLabel(/^Naziv/).fill(name);
    await page.getByLabel(/^ESPB/).fill('6');
    await page.getByRole('button', { name: 'Dodaj' }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Smerovi i godina' })).toBeVisible();
    // The course and its automatic community are both searchable.
    await page.goto(`/pretraga?q=${encodeURIComponent(name)}`);
    await expect(page.locator('a[href*="/predmet/"]', { hasText: name }).first()).toBeVisible();
    await expect(page.locator('a[href^="/z/"]', { hasText: name }).first()).toBeVisible();

    await page.goto('/admin/katalog/uvoz');
    await page
      .getByLabel('Ili nalepi sadržaj')
      .fill(`fakultet;predmet;espb\netf-bg;Uvezeni ${Date.now().toString(36)};5\nnepostoji;Loš;5`);
    await page.getByRole('button', { name: 'Pregledaj' }).click();
    await confirmReauth(page, admin.password);
    await expect(page.getByText('Novih: 1, izmenjenih: 0, sa greškom: 1')).toBeVisible();
    await expect(page.getByText('Fakultet (slug) ne postoji.')).toBeVisible();

    await page.goto('/admin/podesavanja');
    const days = page.getByLabel('Rok za prijavu problema (dana)');
    const original = await days.inputValue();
    await days.fill(String(Number(original) + 1));
    await page.getByRole('button', { name: 'Sačuvaj podešavanja' }).click();
    await expect(page.getByText('Podešavanja su sačuvana.').first()).toBeVisible();
    await page.goto('/admin/dnevnik?akcija=settings');
    await expect(page.getByRole('cell', { name: 'settings.updated' }).first()).toBeVisible();
    await page.goto('/admin/podesavanja');
    await page.getByLabel('Rok za prijavu problema (dana)').fill(original);
    await page.getByRole('button', { name: 'Sačuvaj podešavanja' }).click();
    await expect(page.getByText('Podešavanja su sačuvana.').first()).toBeVisible();
  });
});
