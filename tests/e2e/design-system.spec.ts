import { expect, test } from './fixtures';

import { expectNoSeriousA11yViolations, trackConsoleErrors } from './helpers';

test.describe('design system catalog (/dev/ui)', () => {
  test('renders every component in both themes without a11y or CSP errors', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto('/dev/ui');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('[data-theme="light"]').first()).toBeVisible();
    await expect(page.locator('[data-theme="dark"]').first()).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    expect(errors).toEqual([]);
  });

  test('combobox is diacritics-insensitive and keyboard operable', async ({ page }) => {
    await page.goto('/dev/ui');
    const combo = page.getByRole('combobox', { name: 'Fakultet' }).first();
    await combo.fill('cacak');
    await expect(page.getByRole('option', { name: /Čačku/ }).first()).toBeVisible();
    await combo.fill('nis');
    await combo.press('ArrowDown');
    await combo.press('Enter');
    await expect(combo).toHaveAttribute('placeholder', 'Elektronski fakultet');
  });

  test('theme toggle persists without flash', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'system');
    await page.getByRole('button', { name: /Promeni temu/ }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });
});
