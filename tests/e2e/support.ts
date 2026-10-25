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

export function newTestUser(prefix = 'student'): TestUser {
  return {
    name: 'Test Student',
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
