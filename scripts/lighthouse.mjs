// Runs Lighthouse (mobile, default throttling) on key public pages and enforces score budgets
// (SPEC Phase 10: performance >= 0.9, accessibility / best practices / SEO >= 0.95).
// Each page is run several times and the median score per category counts, because single
// runs vary by several points on the same build.
// Usage: node scripts/lighthouse.mjs [baseUrl] [--perf] [--runs=3]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base =
  process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:3000';
const checkPerf = process.argv.includes('--perf');
const runs = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.split('=')[1] ?? 3);
const pages = (
  process.env.LH_PAGES ??
  '/,/f/etf-bg,/f/etf-bg/predmet/osnovi-elektrotehnike-1,/skripta/oet-1-teorija-i-zadaci-demo,/z/oet1-etf-bg,/zajednice,/provizija-i-isplate'
).split(',');
const budgets = {
  seo: 0.95,
  accessibility: 0.95,
  'best-practices': 0.95,
  ...(checkPerf ? { performance: 0.9 } : {}),
};
const out = mkdtempSync(path.join(tmpdir(), 'lh-'));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
let failed = false;

for (const page of pages) {
  const reports = [];
  for (let run = 0; run < runs; run += 1) {
    const file = path.join(out, `${page.replace(/\W+/g, '_') || 'home'}-${run}.json`);
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
    reports.push(JSON.parse(readFileSync(file, 'utf8')));
  }
  const scores = Object.fromEntries(
    Object.keys(reports[0].categories).map((key) => [
      key,
      median(reports.map((r) => r.categories[key].score)),
    ]),
  );
  const misses = Object.entries(budgets).filter(([key, min]) => (scores[key] ?? 0) < min);
  console.log(page, JSON.stringify(scores), `(median of ${runs})`);
  for (const [key] of misses) {
    failed = true;
    const report = reports[0];
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
