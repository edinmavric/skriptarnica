import { expect, type APIRequestContext, type Page } from '@playwright/test';

export interface OutboxEmail {
  to: string;
  subject: string;
  category: string;
  links: string[];
  text: string;
  headers: Record<string, string>;
}

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@example.com`;
}

export function uniqueUsername(prefix = 'e2e'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Strong random password that won't be in HIBP. */
export function strongPassword(): string {
  return `Skr!pta-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** Polls the dev outbox until an email matching `category` arrives for `to`. */
export async function waitForEmail(
  request: APIRequestContext,
  to: string,
  category: string,
): Promise<OutboxEmail> {
  let found: OutboxEmail | undefined;
  await expect
    .poll(
      async () => {
        const response = await request.get(`/api/dev/outbox?to=${encodeURIComponent(to)}`);
        const emails = (await response.json()) as OutboxEmail[];
        found = emails.find((email) => email.category === category);
        return Boolean(found);
      },
      { timeout: 20_000, intervals: [250, 500, 1000] },
    )
    .toBe(true);
  return found as OutboxEmail;
}

export function linkContaining(email: OutboxEmail, fragment: string): string {
  const link = email.links.find((href) => href.includes(fragment));
  if (!link) throw new Error(`No link containing "${fragment}" in email "${email.subject}"`);
  return link;
}

export interface TestUser {
  name: string;
  username: string;
  email: string;
  password: string;
}

export function newTestUser(prefix = 'student', name = 'Test Student'): TestUser {
  return {
    name,
    username: uniqueUsername(prefix),
    email: uniqueEmail(prefix),
    password: strongPassword(),
  };
}

/** Signs up through the UI, waits for Turnstile, and verifies the email via the outbox link. */
export async function signUpAndVerify(page: Page, user: TestUser): Promise<void> {
  await page.goto('/registracija');
  await page.getByLabel('Ime i prezime').fill(user.name);
  await page.getByLabel('Korisničko ime').fill(user.username);
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel(/^Lozinka( \*)?$/).fill(user.password);
  await page.getByRole('checkbox', { name: /Prihvatam uslove/ }).click();
  await page.getByRole('checkbox', { name: /15 godina/ }).click();
  // Turnstile test keys pass automatically once the widget has rendered.
  await page.waitForFunction(
    () => {
      const input = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
      return Boolean(input?.value);
    },
    undefined,
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: 'Napravi nalog' }).click();
  await expect(page).toHaveURL(/\/potvrdi-email/);
  const email = await waitForEmail(page.request, user.email, 'verifyEmail');
  await page.goto(linkContaining(email, '/api/auth/verify-email'));
}

export async function signIn(
  page: Page,
  user: Pick<TestUser, 'email' | 'password'>,
  next = '/',
): Promise<void> {
  await page.goto(`/prijava?next=${encodeURIComponent(next)}`);
  await page.getByRole('textbox', { name: 'Email' }).fill(user.email);
  await page.getByLabel(/^Lozinka( \*)?$/).fill(user.password);
  await page.getByRole('button', { name: 'Prijavi se', exact: true }).click();
}

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as OTPAuth from 'otpauth';

export function writeTempFile(name: string, data: Buffer): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'skripta-e2e-'));
  const file = path.join(dir, name);
  writeFileSync(file, data);
  return file;
}

/** Grants admin via the ops CLI (same path production uses). */
export function grantAdmin(email: string): void {
  execFileSync('npx', ['tsx', 'scripts/grant-admin.ts', email], { stdio: 'pipe' });
}

export function totp(secret: string): string {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret.replace(/\s+/g, '')),
    digits: 6,
    period: 30,
    algorithm: 'SHA1',
  }).generate();
}

/** Turns on 2FA through the settings UI and returns the TOTP secret. */
export async function enableTwoFactor(page: Page, password: string): Promise<string> {
  await page.goto('/podesavanja/bezbednost');
  // The page also has the password-change form; stay inside the 2FA section.
  const section = page.getByRole('region', { name: 'Dvofaktorska prijava' });
  await section.getByLabel('Trenutna lozinka').fill(password);
  await section.getByRole('button', { name: 'Uključi dvofaktorsku prijavu' }).click();
  const secret = (await page.getByTestId('totp-secret').textContent())?.trim() ?? '';
  await page.getByLabel('Šestocifreni kod').fill(totp(secret));
  await page.getByRole('button', { name: 'Potvrdi i uključi' }).click();
  await expect(page.getByText('Dvofaktorska prijava je uključena.', { exact: true })).toBeVisible();
  return secret;
}

export const PAYOUT_ACCOUNT =
  '160-0000000012345-' + String(98n - (BigInt('160000000001234500') % 97n)).padStart(2, '0');

/** Fills the become-seller form for the signed-in user. */
export async function becomeSeller(page: Page): Promise<void> {
  await page.goto('/prodaja/postani-prodavac');
  await page.getByRole('checkbox', { name: /najmanje 18 godina/ }).click();
  await page.getByLabel(/Ime i prezime vlasnika računa/).fill('Test Prodavac');
  await page.getByLabel(/Broj tekućeg računa/).fill(PAYOUT_ACCOUNT);
  await page.getByRole('checkbox', { name: /pravila za prodavce/ }).click();
  await page.getByRole('button', { name: 'Postani prodavac' }).click();
  await expect(page).toHaveURL(/\/prodaja\/nova/);
}

/** Wizard step 1: pick a course by search. */
export async function chooseCourse(page: Page, query: string, option: RegExp): Promise<void> {
  await page.getByRole('combobox', { name: 'Predmet' }).fill(query);
  await page.getByRole('option', { name: option }).first().click();
  await page.getByRole('button', { name: 'Sačuvaj i nastavi' }).click();
  await expect(page.getByRole('heading', { name: 'Otpremi PDF' })).toBeVisible();
}
