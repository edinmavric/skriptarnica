import { type Page } from '@playwright/test';

import { expect, test } from './fixtures';

import { expectNoSeriousA11yViolations } from './helpers';
import { newTestUser, signIn, signUpAndVerify, waitForEmail, type TestUser } from './support';

const COMMUNITY = '/z/oet1-etf-bg';

async function joinAndPost(page: Page, title: string) {
  await page.goto(COMMUNITY);
  await page.getByRole('button', { name: 'Pridruži se' }).click();
  await expect(page.getByRole('link', { name: 'Nova objava' })).toBeVisible();
  await page.getByRole('link', { name: 'Nova objava' }).click();
  await page.getByLabel(/^Naslov/).fill(title);
  await page.getByRole('textbox', { name: 'Tekst' }).fill('Pitanje za ostale studente.');
  await page.getByRole('button', { name: 'Objavi', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  return page.url();
}

async function requestDeletion(page: Page, user: TestUser) {
  await page.goto('/podesavanja/podaci');
  await page.getByRole('button', { name: 'Obriši nalog' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /Zadrži ih/ })).toBeChecked();
  await dialog.getByLabel(/^Lozinka/).fill(user.password);
  await dialog.getByRole('button', { name: 'Potvrdi brisanje' }).click();
  await expect(page.getByText(/^Nalog će biti obrisan \d/).first()).toBeVisible();
}

test.describe('flow 7: account deletion with a grace period', () => {
  test('request → banner and email → cancel → request again → deleted after the grace period', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const user = newTestUser('brisanje', 'Marko Brisanje');
    await signUpAndVerify(page, user);
    const title = `Ostaje posle brisanja ${Date.now().toString(36)}`;
    const postUrl = await joinAndPost(page, title);

    await page.goto('/podesavanja/podaci');
    await expectNoSeriousA11yViolations(page);
    await requestDeletion(page, user);
    // The banner shows on every page during the grace period.
    await page.goto('/');
    await expect(
      page.getByRole('status').filter({ hasText: 'Nalog će biti obrisan' }),
    ).toBeVisible();
    await waitForEmail(page.request, user.email, 'deletionScheduled');

    await page.getByRole('link', { name: 'Otkaži brisanje' }).click();
    await page.getByRole('button', { name: 'Otkaži brisanje' }).click();
    await expect(page.getByRole('button', { name: 'Obriši nalog' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Nalog će biti obrisan' })).toHaveCount(
      0,
    );
    await waitForEmail(page.request, user.email, 'deletionCancelled');

    await requestDeletion(page, user);
    // 14 days later (dev-only fast-forward runs the real daily job).
    const response = await page.request.post(
      `/api/dev/account-deletion?email=${encodeURIComponent(user.email)}`,
    );
    expect((await response.json()).deleted).toBeGreaterThanOrEqual(1);

    // Signed out everywhere; the old credentials no longer work.
    await page.goto('/podesavanja');
    await expect(page).toHaveURL(/\/prijava/);
    await signIn(page, user);
    await expect(page.getByText('Pogrešan email ili lozinka.')).toBeVisible();
    // The profile is gone; the post stays, attributed to a deleted user.
    expect((await page.request.get(`/u/${user.username}`)).status()).toBe(404);
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(postUrl);
    await expect(guestPage.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(guestPage.getByText('[obrisan korisnik]').first()).toBeVisible();
    const html = await guestPage.content();
    expect(html).not.toContain(user.name);
    expect(html).not.toContain(user.username);
    await guest.close();
  });
});

test.describe('settings and notifications', () => {
  test('data export is built by the job, emailed, and downloadable only by the owner', async ({
    page,
    browser,
  }) => {
    test.setTimeout(120_000);
    const user = newTestUser('izvoz');
    await signUpAndVerify(page, user);
    await page.goto('/podesavanja/podaci');
    await page.getByRole('button', { name: 'Zatraži izvoz' }).click();
    await expect(
      page.getByText('Pravimo arhivu. Poslaćemo ti email kad bude spremna.'),
    ).toBeVisible();
    const email = await waitForEmail(page.request, user.email, 'exportReady');
    const link = email.links.find((href) => href.includes('/api/izvoz/'));
    expect(link).toBeTruthy();
    const download = await page.request.get(link as string);
    expect(download.status()).toBe(200);
    const body = await download.body();
    expect(body.subarray(0, 2).toString()).toBe('PK');
    // Another signed-in user gets a 404, a guest is sent to sign in.
    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    await signUpAndVerify(other, newTestUser('tudji'));
    expect((await other.request.get(link as string, { maxRedirects: 0 })).status()).toBe(404);
    const guest = await browser.newContext();
    const guestResponse = await guest.request.get(link as string, { maxRedirects: 0 });
    expect(guestResponse.status()).toBe(307);
    expect(guestResponse.headers().location).toContain('/prijava');
    await Promise.all([otherCtx.close(), guest.close()]);
  });

  test('a reply shows up in the bell and on the notifications page; preferences save', async ({
    page,
    browser,
  }) => {
    test.setTimeout(150_000);
    const author = newTestUser('pita');
    await signUpAndVerify(page, author);
    const title = `Ko ima rešenja ${Date.now().toString(36)}?`;
    const postUrl = await joinAndPost(page, title);

    const replierCtx = await browser.newContext();
    const replier = await replierCtx.newPage();
    const replierUser = newTestUser('odgovara', 'Jovana Odgovara');
    await signUpAndVerify(replier, replierUser);
    await replier.goto(COMMUNITY);
    await replier.getByRole('button', { name: 'Pridruži se' }).click();
    await expect(replier.getByRole('link', { name: 'Nova objava' })).toBeVisible();
    await replier.goto(postUrl);
    await replier.getByLabel('Tvoj komentar').fill(`Imam, javi se @${author.username}`);
    await replier.getByRole('button', { name: 'Komentariši' }).click();
    await expect(replier.getByText('Imam, javi se')).toBeVisible();

    // The job creates the notification; the header count follows.
    await expect
      .poll(
        async () => {
          await page.goto('/obavestenja');
          return page.getByText(`${replierUser.username} je odgovorio na tvoju objavu`).count();
        },
        { timeout: 30_000, intervals: [1000, 2000] },
      )
      .toBeGreaterThan(0);
    await expect(page.getByRole('link', { name: /Obaveštenja/ }).first()).toHaveAccessibleName(/1/);
    await expectNoSeriousA11yViolations(page);
    // The reply both answers and mentions the author: one notification, not two.
    await expect(page.getByText(/te je pomenuo/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Označi sve kao pročitano' }).click();
    await expect(page.getByRole('button', { name: 'Označi sve kao pročitano' })).toHaveCount(0);

    await page.goto('/podesavanja/obavestenja');
    const select = page.getByRole('combobox', { name: 'Odgovori u zajednicama' });
    await select.selectOption('none');
    await expect(page.getByText('Sačuvano.', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Odgovori u zajednicama' })).toHaveValue(
      'none',
    );
    await expectNoSeriousA11yViolations(page);
    await replierCtx.close();
  });

  test('public profile shows public activity and respects privacy settings', async ({
    page,
    browser,
  }) => {
    const user = newTestUser('profil', 'Ana Profil');
    await signUpAndVerify(page, user);
    const title = `Javna objava ${Date.now().toString(36)}`;
    await joinAndPost(page, title);
    await page.goto('/profil');
    await expect(page).toHaveURL(new RegExp(`/u/${user.username}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'Ana Profil' })).toBeVisible();
    await expect(page.getByRole('link', { name: title })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.goto('/podesavanja/privatnost');
    await page.getByRole('switch', { name: 'Prikaži objave i komentare' }).click();
    await expect(page.getByText('Sačuvano.', { exact: true })).toBeVisible();
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(`/u/${user.username}`);
    await expect(guestPage.getByText('Korisnik je sakrio objave i komentare.')).toBeVisible();
    await expect(guestPage.getByRole('link', { name: title })).toHaveCount(0);
    await guest.close();
  });

  test('sessions: another device can be signed out', async ({ page, browser }) => {
    const user = newTestUser('sesije');
    await signUpAndVerify(page, user);
    const otherCtx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    });
    const other = await otherCtx.newPage();
    await signIn(other, user);
    await expect(other).toHaveURL(/\/($|\?|pocetak)/);
    await page.goto('/podesavanja/bezbednost');
    await page.getByRole('button', { name: 'Odjavi: Firefox na sistemu Linux' }).click();
    await expect(page.getByRole('button', { name: /Odjavi: Firefox/ })).toHaveCount(0);
    await other.goto('/podesavanja');
    await expect(other).toHaveURL(/\/prijava/);
    await otherCtx.close();
  });
});
