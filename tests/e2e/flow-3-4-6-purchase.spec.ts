import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { analyzePdf } from '@/server/pdf/analyze';

import { expectNoSeriousA11yViolations } from './helpers';
import {
  enableTwoFactor,
  grantAdmin,
  newTestUser,
  signUpAndVerify,
  type TestUser,
} from './support';

const PAID_NOTE = '/skripta/oet-1-teorija-i-zadaci-demo';
const FREE_NOTE = '/skripta/matematika-1-formule-demo';

async function startCheckout(page: Page, notePath: string) {
  await page.goto(notePath);
  await page.getByRole('link', { name: 'Kupi skriptu' }).click();
  await expect(page.getByRole('heading', { name: 'Pregled kupovine' })).toBeVisible();
  await page.getByRole('checkbox', { name: /dostupna odmah/ }).click();
  await page.getByRole('button', { name: 'Plati karticom' }).click();
  await expect(page.getByRole('heading', { name: 'Testno plaćanje' })).toBeVisible();
}

async function buyPaidNote(page: Page) {
  await startCheckout(page, PAID_NOTE);
  await page.getByRole('button', { name: 'Uspešno plaćanje' }).click();
  await expect(page.getByText('Plaćanje je uspelo. Skripta je u tvojoj biblioteci.')).toBeVisible({
    timeout: 30_000,
  });
}

test.describe('flow 3: purchase with the mock provider → library → watermarked download', () => {
  test('a buyer pays, finds the note in the library and downloads a watermarked PDF', async ({
    page,
  }) => {
    const buyer: TestUser = newTestUser('buyer');
    await signUpAndVerify(page, buyer);
    await page.goto(PAID_NOTE);
    await page.getByRole('link', { name: 'Kupi skriptu' }).click();
    await expect(page.getByText('800 RSD')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    // The withdrawal checkbox is required and not pre-checked.
    await expect(page.getByRole('checkbox', { name: /dostupna odmah/ })).not.toBeChecked();
    await page.getByRole('button', { name: 'Plati karticom' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Potvrdi da tražiš da skripta bude dostupna odmah.' }),
    ).toBeVisible();
    await page.getByRole('checkbox', { name: /dostupna odmah/ }).click();
    await page.getByRole('button', { name: 'Plati karticom' }).click();
    await page.getByRole('button', { name: 'Uspešno plaćanje' }).click();
    await expect(page.getByText(/Plaćanje se obrađuje|Plaćanje je uspelo/)).toBeVisible();
    await expect(page.getByText('Plaćanje je uspelo. Skripta je u tvojoj biblioteci.')).toBeVisible(
      { timeout: 30_000 },
    );

    await page.getByRole('link', { name: 'Idi u biblioteku' }).click();
    await expect(page.getByRole('link', { name: 'OET 1 — teorija i rešeni zadaci' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Preuzmi' }).first().click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^oet-1-teorija-i-reseni-zadaci-v1\.pdf$/);
    const file = readFileSync((await download.path()) as string);
    const analysis = await analyzePdf(file, 60 * 1024 * 1024);
    expect(analysis.ok).toBe(true);
    if (analysis.ok) {
      expect(analysis.value.text).toContain(`(@${buyer.username})`);
      expect(analysis.value.text).toContain('Licencirano za: Test Student');
    }
    // No daily download limit: a second download works too.
    const again = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Preuzmi' }).first().click();
    await again;

    // The note page now says it's in the library.
    await page.goto(PAID_NOTE);
    await expect(page.getByRole('link', { name: 'U tvojoj biblioteci' })).toBeVisible();
  });

  test('a free note is added to the library without payment', async ({ page }) => {
    await signUpAndVerify(page, newTestUser('free'));
    await page.goto(FREE_NOTE);
    await page.getByRole('link', { name: 'Uzmi besplatno' }).click();
    await page.getByRole('checkbox', { name: /dostupna odmah/ }).click();
    await page.getByRole('button', { name: 'Dodaj u biblioteku' }).click();
    await expect(page).toHaveURL(/\/biblioteka/);
    await expect(page.getByRole('link', { name: /Matematika 1 — sve formule/ })).toBeVisible();
  });

  test('a guest is sent to sign in before buying', async ({ page }) => {
    await page.goto(PAID_NOTE);
    await page.getByRole('link', { name: 'Kupi skriptu' }).click();
    await expect(page).toHaveURL(/\/prijava\?next=/);
  });
});

test.describe('flow 4: failed payment and cancellation', () => {
  test('a declined card and a cancelled payment grant nothing', async ({ page }) => {
    await signUpAndVerify(page, newTestUser('declined'));
    await startCheckout(page, PAID_NOTE);
    await page.getByRole('button', { name: 'Kartica odbijena' }).click();
    await expect(page.getByText(/Plaćanje nije uspelo ili je otkazano/)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('link', { name: 'Pokušaj ponovo' }).click();
    await expect(page.getByRole('heading', { name: 'Pregled kupovine' })).toBeVisible();

    await page.getByRole('checkbox', { name: /dostupna odmah/ }).click();
    await page.getByRole('button', { name: 'Plati karticom' }).click();
    await page.getByRole('button', { name: 'Otkaži' }).click();
    await expect(page.getByText('Plaćanje je otkazano. Možeš pokušati ponovo.')).toBeVisible();

    await page.goto('/biblioteka');
    await expect(page.getByText('Biblioteka je prazna')).toBeVisible();
    const response = await page.request.get(
      '/api/preuzimanje/00000000-0000-7000-8000-000000000000',
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(307);
  });
});

test.describe('flow 6: refund through admin', () => {
  test('a buyer reports a problem, an admin refunds, access is revoked', async ({ browser }) => {
    test.setTimeout(180_000);
    const buyerContext = await browser.newContext();
    const page = await buyerContext.newPage();
    await signUpAndVerify(page, newTestUser('refund'));
    await buyPaidNote(page);
    await page.goto('/biblioteka');
    await page.getByRole('button', { name: 'Prijavi problem' }).click();
    await page.getByRole('radio', { name: 'Fajl je oštećen' }).check();
    await page.getByLabel('Opiši problem').fill('Strane od 5 do 10 se ne otvaraju u čitaču.');
    await page.getByRole('button', { name: 'Pošalji prijavu' }).click();
    await expect(page.getByText('Prijava problema u obradi')).toBeVisible();

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const admin = newTestUser('refadmin');
    await signUpAndVerify(adminPage, admin);
    grantAdmin(admin.email);
    await enableTwoFactor(adminPage, admin.password);
    await adminPage.goto('/admin/povracaji');
    const row = adminPage.getByRole('listitem').filter({ hasText: 'Strane od 5 do 10' });
    await row.getByRole('button', { name: 'Odobri povraćaj' }).click();
    await expect(adminPage.getByText('Povraćaj je izvršen.').first()).toBeVisible();

    await page.goto('/biblioteka');
    await expect(page.getByText('Biblioteka je prazna')).toBeVisible();
    await page.goto(PAID_NOTE);
    await expect(page.getByRole('link', { name: 'Kupi skriptu' })).toBeVisible();
    await buyerContext.close();
    await adminContext.close();
  });
});
