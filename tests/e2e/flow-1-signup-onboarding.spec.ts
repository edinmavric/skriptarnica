import { expect, test } from './fixtures';

import { expectNoSeriousA11yViolations } from './helpers';
import { linkContaining, newTestUser, signIn, signUpAndVerify, waitForEmail } from './support';

test.describe('flow 1: sign-up → verification → onboarding', () => {
  test('a new ETF student completes onboarding', async ({ page }) => {
    const user = newTestUser();
    await signUpAndVerify(page, user);

    // Verification auto-signs in and lands on onboarding.
    await expect(page).toHaveURL(/\/pocetak/);
    await expect(page.getByRole('heading', { name: 'Gde studiraš?' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Diacritics-insensitive search: "beograd" → Univerzitet u Beogradu, "elektro" → ETF.
    await page.getByRole('combobox', { name: 'Univerzitet' }).fill('beograd');
    await page.getByRole('option', { name: /Univerzitet u Beogradu/ }).click();
    await page.getByRole('combobox', { name: 'Fakultet' }).fill('elektrotehn');
    await page.getByRole('option', { name: /Elektrotehnički fakultet/ }).click();
    await page.getByRole('combobox', { name: 'Smer' }).click();
    await page.getByRole('option', { name: 'Elektrotehnika i računarstvo' }).click();
    await page.getByLabel('Godina studija').selectOption('1');
    await page.getByRole('button', { name: 'Nastavi' }).click();

    // Courses step: year-1 courses are suggested as "Slušam".
    await expect(page.getByRole('heading', { name: /Koje predmete slušaš/ })).toBeVisible();
    const oet = page.getByRole('group', { name: 'Status predmeta Osnovi elektrotehnike 1' });
    await expect(oet.getByRole('radio', { name: 'Slušam' })).toBeChecked();
    await page
      .getByRole('group', { name: 'Status predmeta Matematika 1' })
      .getByText('Položio')
      .click();
    await page.getByLabel('Ocena iz predmeta Matematika 1').selectOption('9');
    await page.getByRole('button', { name: 'Sačuvaj predmete' }).click();

    // Student email step: wrong domain is rejected with a clear message, then skipped.
    await expect(page.getByRole('heading', { name: /Potvrdi da si student/ })).toBeVisible();
    await page.getByLabel('Studentski email').fill('neko@gmail.com');
    await page.getByRole('button', { name: 'Pošalji link' }).click();
    await expect(page.getByText(/nije sa domena tvog univerziteta/)).toBeVisible();
    await page.getByRole('button', { name: 'Preskoči i završi' }).click();
    await expect(page).toHaveURL(/\/$/);

    // Home feed: recommendations for ETF year 1 and the upcoming exam period.
    await expect(page.getByRole('heading', { level: 1, name: 'Zdravo, Test' })).toBeVisible();
    const forYou = page.getByRole('region', { name: 'Za tvoje predmete' });
    await expect(
      forYou.getByRole('link', { name: 'OET 1 — teorija i rešeni zadaci' }),
    ).toBeVisible();
    await expect(
      forYou.getByRole('link', { name: /Programiranje 1 — C od nule do ispita/ }),
    ).toBeVisible();
    // Matematika 1 was marked as passed, so its notes are not recommended.
    await expect(forYou.getByRole('link', { name: /Matematika 1 — sve formule/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Ispitni rok se bliži' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    // Onboarding is done: visiting it again goes home.
    await page.goto('/pocetak');
    await expect(page).toHaveURL(/\/$/);
  });

  test('sign-in rejects a wrong password and locks out after repeated failures', async ({
    page,
    context,
  }) => {
    const user = newTestUser('lock');
    await signUpAndVerify(page, user);
    await context.clearCookies();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await signIn(page, { email: user.email, password: 'pogresna-lozinka-123' });
      if (attempt < 5)
        await expect(
          page.getByRole('alert').filter({ hasText: 'Pogrešan email ili lozinka.' }),
        ).toBeVisible();
    }
    await expect(page.getByRole('alert').filter({ hasText: /zaključan/ })).toBeVisible();
    // Even the right password is refused while locked.
    await signIn(page, user);
    await expect(page.getByRole('alert').filter({ hasText: /zaključan/ })).toBeVisible();
  });

  test('sign-up validates fields with Serbian messages and keeps focus on the first error', async ({
    page,
  }) => {
    await page.goto('/registracija');
    await page.getByRole('button', { name: 'Napravi nalog' }).click();
    await expect(page.getByText('Ime mora imati bar 2 slova.')).toBeVisible();
    await expect(page.getByLabel('Ime i prezime')).toBeFocused();
    await page.getByLabel(/^Lozinka( \*)?$/).fill('kratka');
    await page.getByLabel(/^Lozinka( \*)?$/).blur();
    await expect(page.getByText('Lozinka mora imati najmanje 10 znakova.')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test('guests are sent to sign-in and back', async ({ page }) => {
    await page.goto('/pocetak');
    await expect(page).toHaveURL(/\/prijava\?next=%2Fpocetak/);
  });
});

test.describe('passwordless and recovery', () => {
  test('magic link signs an existing user in', async ({ page, context }) => {
    const user = newTestUser('magic');
    await signUpAndVerify(page, user);
    await context.clearCookies();
    await page.goto('/prijava');
    await page.getByRole('tab', { name: 'Linkom na email' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
    await page.waitForFunction(
      () =>
        Boolean(
          document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')?.value,
        ),
      undefined,
      {
        timeout: 30_000,
      },
    );
    await page.getByRole('button', { name: 'Pošalji link' }).click();
    await expect(page.getByText(/link za prijavu je poslat/)).toBeVisible();
    const email = await waitForEmail(page.request, user.email, 'magicLink');
    await page.goto(linkContaining(email, '/api/auth/magic-link/verify'));
    await expect(
      page
        .getByRole('button', { name: /Meni naloga/ })
        .or(page.getByRole('link', { name: 'Profil' })),
    ).toBeVisible();
  });

  test('password reset sets a new password and the old one stops working', async ({
    page,
    context,
  }) => {
    const user = newTestUser('reset');
    await signUpAndVerify(page, user);
    await context.clearCookies();
    await page.goto('/zaboravljena-lozinka');
    await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
    await page.getByRole('button', { name: 'Pošalji link' }).click();
    await expect(page.getByText(/poslali smo link za promenu lozinke/)).toBeVisible();
    const email = await waitForEmail(page.request, user.email, 'resetPassword');
    await page.goto(linkContaining(email, '/reset-password/'));
    await expect(page).toHaveURL(/\/nova-lozinka\?token=/);
    const newPassword = `${user.password}-novo`;
    await page.getByLabel('Nova lozinka', { exact: true }).fill(newPassword);
    await page.getByLabel('Ponovi novu lozinku').fill(newPassword);
    await page.getByRole('button', { name: 'Sačuvaj lozinku' }).click();
    await expect(page.getByText(/Lozinka je promenjena/)).toBeVisible();

    await signIn(page, user);
    await expect(
      page.getByRole('alert').filter({ hasText: 'Pogrešan email ili lozinka.' }),
    ).toBeVisible();
    await signIn(page, { email: user.email, password: newPassword });
    await expect(page).toHaveURL(/\/$/);
  });
});
