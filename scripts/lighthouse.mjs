// Runs Lighthouse (mobile, default throttling) on key public pages and enforces score budgets.
// Usage: node scripts/lighthouse.mjs [baseUrl] [--perf]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:3000';
const checkPerf = process.argv.includes('--perf');
const pages = (
  process.env.LH_PAGES ??
  '/,/f/etf-bg,/f/etf-bg/predmet/osnovi-elektrotehnike-1,/univerzitet/univerzitet-u-beogradu'
).split(',');
const budgets = {
  seo: 0.95,
  accessibility: 0.95,
  'best-practices': 0.95,
  ...(checkPerf ? { performance: 0.9 } : {}),
};
const out = mkdtempSync(path.join(tmpdir(), 'lh-'));
let failed = false;

for (const page of pages) {
  const file = path.join(out, `${page.replace(/\W+/g, '_') || 'home'}.json`);
  execFileSync(
    'npx',
    [
      'lighthouse',
      `${base}${page}`,
      '--quiet',
      '--output=json',
      `--output-path=${file}`,
      '--chrome-flags=--headless=new --no-sandbox',
      '--only-categories=performance,accessibility,best-practices,seo',
    ],
    { stdio: 'inherit' },
  );
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const scores = Object.fromEntries(
    Object.entries(report.categories).map(([key, value]) => [key, value.score]),
  );
  const misses = Object.entries(budgets).filter(([key, min]) => (scores[key] ?? 0) < min);
  console.log(page, JSON.stringify(scores));
  for (const [key] of misses) {
    failed = true;
    const audits = report.categories[key].auditRefs
      .map((ref) => report.audits[ref.id])
      .filter(
        (audit) =>
          audit.score !== null && audit.score < 1 && audit.scoreDisplayMode !== 'informative',
      )
      .map((audit) => `   - ${audit.id}: ${audit.title}`);
    console.log(`  ✗ ${key} below ${budgets[key]}:\n${audits.slice(0, 8).join('\n')}`);
  }
}
process.exit(failed ? 1 : 0);
