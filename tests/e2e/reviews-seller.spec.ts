import { expect, test } from '@playwright/test';

import { expectNoSeriousA11yViolations } from './helpers';
import { newTestUser, signIn, signUpAndVerify } from './support';

const NOTE = '/skripta/programiranje-1-c-demo';

test('a buyer reviews, the seller replies once, and the dashboard shows earnings', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const buyerContext = await browser.newContext();
  const page = await buyerContext.newPage();
  const buyer = newTestUser('reviewer');
  await signUpAndVerify(page, buyer);
  await page.goto(NOTE);
  await page.getByRole('link', { name: 'Kupi skriptu' }).click();
  await page.getByRole('checkbox', { name: /dostupna odmah/ }).click();
  await page.getByRole('button', { name: 'Plati karticom' }).click();
  await page.getByRole('button', { name: 'Uspešno plaćanje' }).click();
  await expect(page.getByText('Plaćanje je uspelo. Skripta je u tvojoj biblioteci.')).toBeVisible({
    timeout: 30_000,
  });

  await page.goto('/biblioteka');
  await page.getByRole('button', { name: 'Oceni' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Objavi ocenu' }).click();
  await expect(dialog.getByText('Izaberi ocenu od 1 do 5.')).toBeVisible();
  await dialog.locator('label').filter({ hasText: '5 zvezdica' }).click();
  const text = `Odlična skripta, pokazivači objašnjeni jasno ${Date.now()}.`;
  await dialog.getByLabel('Utisak').fill(text);
  await dialog.getByLabel(/Položio sam uz ovu skriptu/).selectOption('9');
  await dialog.getByRole('button', { name: 'Objavi ocenu' }).click();
  await expect(page.getByText('Ocenjeno').first()).toBeVisible();

  await page.goto(NOTE);
  const review = page.getByRole('article').filter({ hasText: text });
  await expect(review).toBeVisible();
  await expect(review.getByText('Položio sa 9')).toBeVisible();

  const sellerContext = await browser.newContext();
  const seller = await sellerContext.newPage();
  await signIn(
    seller,
    { email: 'djordje.demo@example.com', password: 'demo-skripta-2026' },
    '/prodaja',
  );
  await expect(seller).toHaveURL(/\/prodaja/);
  await expect(seller.getByText('Na čekanju')).toBeVisible();
  await expect(seller.getByRole('heading', { name: /Prodaje po danima/ })).toBeVisible();
  await expectNoSeriousA11yViolations(seller);

  await seller.goto(NOTE);
  const sellerView = seller.getByRole('article').filter({ hasText: text });
  await sellerView.getByRole('button', { name: 'Odgovori' }).click();
  await sellerView.getByLabel('Tvoj odgovor').fill('Hvala, drago mi je da je pomoglo!');
  await sellerView.getByRole('button', { name: 'Objavi odgovor' }).click();
  await expect(sellerView.getByText('Hvala, drago mi je da je pomoglo!')).toBeVisible();
  await expect(sellerView.getByRole('button', { name: 'Odgovori' })).toHaveCount(0);
  await buyerContext.close();
  await sellerContext.close();
});
