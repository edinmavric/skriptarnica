import { toHtml } from 'hast-util-to-html';
import { describe, expect, it } from 'vitest';

import { markdownExcerpt, markdownToHast } from '@/lib/markdown';

const html = (md: string) => toHtml(markdownToHast(md));

describe('markdown sanitization', () => {
  it('drops raw HTML and scripts', () => {
    const out = html('Zdravo <script>alert(1)</script> <img src=x onerror=alert(1)> <b>x</b>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onerror');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<b>');
  });

  it('blocks javascript: links and adds rel to links', () => {
    expect(html('[klik](javascript:alert(1))')).not.toContain('javascript:');
    const out = html('[sajt](https://etf.bg.ac.rs)');
    expect(out).toContain('href="https://etf.bg.ac.rs"');
    expect(out).toContain('rel="nofollow ugc noopener noreferrer"');
  });

  it('demotes headings so the page h1 stays unique', () => {
    expect(html('# Naslov')).toContain('<h2>');
    expect(html('## Pod')).toContain('<h3>');
  });

  it('supports GFM tables and task lists', () => {
    expect(html('| a | b |\n|---|---|\n| 1 | 2 |')).toContain('<table>');
    expect(html('- [x] gotovo')).toContain('type="checkbox"');
  });

  it('builds plain excerpts', () => {
    expect(
      markdownExcerpt('## Kako sam učio\n\n**Prvo** sam [pročitao](https://x.rs) skriptu.'),
    ).toBe('Kako sam učio Prvo sam pročitao skriptu.');
    expect(markdownExcerpt('reč '.repeat(100), 30).endsWith('…')).toBe(true);
  });
});
