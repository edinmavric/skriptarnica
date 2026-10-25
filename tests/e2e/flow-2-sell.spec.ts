import { expect, test } from './fixtures';

import { makeEncryptedPdf, makeNotPdf, makePdf, uniqueParagraphs } from '../fixtures/pdf';

import { expectNoSeriousA11yViolations } from './helpers';
import {
  becomeSeller,
  chooseCourse,
  enableTwoFactor,
  grantAdmin,
  newTestUser,
  signUpAndVerify,
  writeTempFile,
} from './support';

test.describe.configure({ mode: 'serial' });

test.describe('flow 2: become a seller → upload → processing → publish after admin approval', () => {
  test('a seller publishes a note that an admin approves', async ({ browser }) => {
    test.setTimeout(240_000);
    const sellerContext = await browser.newContext();
    const page = await sellerContext.newPage();
    const seller = newTestUser('seller');
    await signUpAndVerify(page, seller);
    await page.goto('/pocetak');
    await becomeSeller(page);
    await expectNoSeriousA11yViolations(page);

    await chooseCourse(page, 'oet', /Osnovi elektrotehnike 1/);
    const title = `OET 1 skripta ${Date.now().toString(36)}`;
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        writeTempFile('oet.pdf', await makePdf({ pages: 20, paragraphs: uniqueParagraphs() })),
      );
    await expect(page.getByRole('heading', { name: 'Obrađujemo fajl' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Fajl je spreman: 20 strana/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('img', { name: 'Pregled strane 1' })).toBeVisible();
    await page.getByRole('button', { name: 'Nastavi na opis' }).click();

    await page.getByLabel(/^Naslov/).fill(title);
    await page
      .getByLabel(/^Kratak opis/)
      .fill('Kompletna teorija sa predavanja i rešeni zadaci sa rokova.');
    await page
      .getByRole('textbox', { name: /Kako sam učio/ })
      .fill(
        'Učio sam dvanaest dana, po četiri do pet sati dnevno. Prvo teorija, pa zadaci sa rokova od najnovijih ka starijim. '.repeat(
          3,
        ),
      );
    await page.getByLabel(/Ocena sa ispita/).selectOption('9');
    await page.getByRole('button', { name: 'Sačuvaj i nastavi' }).click();

    await page.getByRole('textbox', { name: /^Cena/ }).fill('800');
    await expect(page.getByText(/Dobijaš 640 RSD po prodaji/)).toBeVisible();
    await page.getByRole('button', { name: 'Sačuvaj i nastavi' }).click();

    await page.getByRole('checkbox', { name: /Potvrđujem sve navedeno/ }).click();
    await page.getByRole('button', { name: 'Potvrdi i nastavi' }).click();
    await expect(page.getByText('Sve je spremno.')).toBeVisible();
    await page.getByRole('button', { name: 'Objavi skriptu' }).click();
    await expect(page.getByText(/poslata na pregled/)).toBeVisible();

    // Not public while pending.
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto('/f/etf-bg/predmet/osnovi-elektrotehnike-1');
    await expect(guestPage.getByRole('link', { name: title })).toHaveCount(0);

    // Admin approves (role granted via CLI; 2FA is mandatory before /admin opens).
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const admin = newTestUser('admin');
    await signUpAndVerify(adminPage, admin);
    grantAdmin(admin.email);
    await adminPage.goto('/admin');
    await expect(adminPage).toHaveURL(/\/podesavanja\/bezbednost\?admin=1/);
    await enableTwoFactor(adminPage, admin.password);
    await adminPage.goto('/admin/skripte');
    await adminPage.getByRole('link', { name: title }).click();
    await expect(adminPage.getByText('Prve skripte')).toHaveCount(0);
    await adminPage.getByRole('button', { name: 'Odobri i objavi' }).click();
    await expect(adminPage.getByText('Skripta je objavljena.', { exact: true })).toBeVisible();
    await expect(adminPage).toHaveURL(/\/admin\/skripte$/);

    // Public now: course listing → note page with previews, grade and "how I studied".
    await guestPage.reload();
    await guestPage.getByRole('link', { name: title }).click();
    await expect(guestPage.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(
      guestPage.getByRole('img', { name: new RegExp(`Strana 1 skripte ${title}`) }),
    ).toBeVisible();
    await expect(guestPage.getByText('Položio sa 9')).toBeVisible();
    await expect(guestPage.getByRole('heading', { name: 'Kako sam učio' })).toBeVisible();
    await expect(guestPage.getByText('800 RSD')).toBeVisible();
    await expectNoSeriousA11yViolations(guestPage);
    const jsonLd = await guestPage
      .locator('script[type="application/ld+json"]')
      .evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            JSON.parse(node.textContent ?? '{}') as {
              '@type'?: string;
              offers?: { price?: string };
            },
        ),
      );
    expect(jsonLd.find((entry) => entry['@type'] === 'Product')?.offers?.price).toBe('800.00');

    await sellerContext.close();
    await guest.close();
    await adminContext.close();
  });

  test('a non-PDF and an encrypted PDF are rejected with clear messages', async ({ page }) => {
    test.setTimeout(180_000);
    const seller = newTestUser('reject');
    await signUpAndVerify(page, seller);
    await page.goto('/pocetak');
    await becomeSeller(page);
    await chooseCourse(page, 'matematika 1', /Matematika 1/);

    await page
      .locator('input[type="file"]')
      .setInputFiles(writeTempFile('lazni.pdf', makeNotPdf()));
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Ovo nije PDF. Sačuvaj skriptu kao PDF i otpremi ponovo.' }),
    ).toBeVisible({ timeout: 30_000 });

    await page
      .locator('input[type="file"]')
      .setInputFiles(writeTempFile('zakljucan.pdf', await makeEncryptedPdf()));
    await expect(
      page.getByRole('alert').filter({ hasText: /PDF je zaključan lozinkom/ }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Otpremi drugi fajl' })).toBeVisible();
  });

  test('a regular user cannot open the admin area', async ({ page }) => {
    const user = newTestUser('noadmin');
    await signUpAndVerify(page, user);
    const response = await page.goto('/admin/skripte');
    expect(response?.status()).toBe(404);
  });
});
