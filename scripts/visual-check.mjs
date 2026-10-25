// Dev tool: full-page screenshot + axe scan. Usage: node scripts/visual-check.mjs <url> <out.png> [width] [light|dark]
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
const [, , url, out, width = '1600', scheme = 'light'] = process.argv;
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: Number(width), height: 900 },
  colorScheme: scheme,
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: 'networkidle' });
await page.screenshot({ path: out, fullPage: true });
const axe = await new AxeBuilder({ page }).analyze();
const v = axe.violations.map(
  (x) => `${x.impact} ${x.id}: ${x.help} (${x.nodes.length}) e.g. ${x.nodes[0]?.target}`,
);
console.log(JSON.stringify({ errors, violations: v }, null, 1));
await browser.close();
