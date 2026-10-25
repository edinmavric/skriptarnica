import { expect, test } from './fixtures';

/**
 * Crawls public pages as a guest from the home page and footer, following internal links
 * (breadth first, up to 120 pages), and fails on any 4xx/5xx. Sign-in redirects are fine.
 */
test('every internal link on public pages resolves', async ({ request }) => {
  test.setTimeout(240_000);
  const queue = ['/'];
  const seen = new Set(queue);
  const broken: string[] = [];
  let visited = 0;
  while (queue.length > 0 && visited < 120) {
    const path = queue.shift() as string;
    visited += 1;
    const response = await request.get(path, { maxRedirects: 5 });
    if (response.status() >= 400) {
      broken.push(`${response.status()} ${path}`);
      continue;
    }
    if (!(response.headers()['content-type'] ?? '').includes('text/html')) continue;
    const html = await response.text();
    for (const match of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const href = (match[1] ?? '').replace(/&amp;/g, '&');
      if (!href || seen.has(href)) continue;
      if (/^\/(_next|api|admin)\b|\.(css|js|png|svg|ico|webmanifest|xml|txt)$/.test(href)) continue;
      seen.add(href);
      queue.push(href);
    }
  }
  expect(visited).toBeGreaterThan(30);
  expect(broken).toEqual([]);
});
