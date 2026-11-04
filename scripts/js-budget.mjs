// Enforces the JS budget for public pages (SPEC §8.2, relaxed, see docs/DECISIONS.md):
// 250 KB gzip for content pages, 300 KB for pages built around a form (they ship zod and
// react-hook-form). For each page, every same-origin script the HTML loads is fetched and
// gzipped, and the total must stay under its budget. Lazy chunks loaded later don't count.
// Usage: node scripts/js-budget.mjs [baseUrl]
// Without a baseUrl it starts `next start` on port 3100 against the current build.
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';

const CONTENT_KB = 250;
const FORM_KB = 300;
const pages = [
  ...[
    '/',
    '/f/etf-bg',
    '/f/etf-bg/predmet/osnovi-elektrotehnike-1',
    '/skripta/oet-1-teorija-i-zadaci-demo',
    '/z/oet1-etf-bg',
    '/zajednice',
    '/pretraga?q=oet',
    '/provizija-i-isplate',
    '/uslovi-koriscenja',
    '/kontakt',
  ].map((path) => ({ path, budget: CONTENT_KB })),
  ...['/prijava', '/registracija', '/zaboravljena-lozinka', '/prijava-povrede-autorskih-prava'].map(
    (path) => ({ path, budget: FORM_KB }),
  ),
];

const givenBase = process.argv[2];
const base = givenBase ?? 'http://localhost:3100';
let server;
// Last lines of the server's output, shown when the check fails (CI logs aren't always at hand).
const serverLog = [];
/** Prints a failure; on GitHub Actions also as an annotation, so it shows on the run page. */
function report(message) {
  console.error(message);
  if (process.env.GITHUB_ACTIONS)
    console.log(`::error title=JS budget::${message.replaceAll('\n', '%0A')}`);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server at ${base} did not start`);
}

if (!givenBase) {
  server = spawn('npx', ['next', 'start', '-p', '3100'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverLog.push(...String(chunk).split('\n').filter(Boolean));
      serverLog.splice(0, Math.max(0, serverLog.length - 30));
    });
  }
}

const sizes = new Map();
async function gzipSize(src) {
  const cached = sizes.get(src);
  if (cached !== undefined) return cached;
  const res = await fetch(new URL(src, base));
  if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
  const size = gzipSync(Buffer.from(await res.arrayBuffer()), { level: 9 }).length;
  sizes.set(src, size);
  return size;
}

let failed = false;
try {
  await waitForServer();
  for (const { path: page, budget } of pages) {
    const res = await fetch(`${base}${page}`);
    if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
    const html = await res.text();
    const srcs = [
      ...new Set(
        [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)]
          .map((match) => match[1].replaceAll('&amp;', '&'))
          .filter((src) => src.startsWith('/')),
      ),
    ];
    let total = 0;
    for (const src of srcs) total += await gzipSize(src);
    const kb = total / 1024;
    const over = kb > budget;
    failed ||= over;
    if (over) report(`${page}: ${kb.toFixed(1)} KB gzip is over the ${budget} KB budget`);
    console.log(
      `${over ? '✗' : '✓'} ${page}: ${kb.toFixed(1)} KB gzip in ${srcs.length} scripts (budget ${budget} KB)`,
    );
  }
} catch (error) {
  report(
    `${error instanceof Error ? error.message : String(error)}\nServer output:\n${serverLog.join('\n')}`,
  );
  failed = true;
} finally {
  if (server?.pid) process.kill(-server.pid, 'SIGTERM');
}
process.exit(failed ? 1 : 0);
