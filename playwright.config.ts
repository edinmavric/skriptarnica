import { defineConfig, devices } from '@playwright/test';

import { e2eDatabaseUrl } from './tests/e2e/prepare-db';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// Locally and in CI, E2E uses its own database (prepared by the web server command below), never
// the dev database. Set here so test workers and the CLI helpers they run use it too.
if (!process.env.E2E_BASE_URL) process.env.DATABASE_URL = e2eDatabaseUrl();

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    locale: 'sr-Latn-RS',
    timezoneId: 'Europe/Belgrade',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npx tsx tests/e2e/prepare-db.ts && npm run start',
        url: `${baseURL}/api/health`,
        // Never reuse a running server: a dev server on :3000 would use the dev database. Stop it
        // first (the Inngest dev server calls back to :3000, so E2E can't move to another port).
        reuseExistingServer: false,
        // Server logs go into the test output, so a failure shows what the app logged.
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          DATABASE_URL: e2eDatabaseUrl(),
          // The suite signs in and registers many times from one IP.
          RATE_LIMIT_MULTIPLIER: '50',
        },
        timeout: 240_000,
      },
});
