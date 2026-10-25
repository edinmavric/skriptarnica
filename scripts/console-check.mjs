// Dev tool: prints console messages and failed requests for a page. Usage: node scripts/console-check.mjs <url> [waitMs]
import { chromium } from '@playwright/test';
const [, , url, wait = '6000'] = process.argv;
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
page.on('requestfailed', (r) =>
  console.log('[requestfailed]', r.url().slice(0, 200), r.failure()?.errorText),
);
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(Number(wait));
console.log(
  'hydrated-form-check:',
  await page.evaluate(() => Boolean(document.querySelector('form'))),
);
await browser.close();
