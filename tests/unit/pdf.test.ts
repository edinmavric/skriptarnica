import { describe, expect, it } from 'vitest';

import { DUPLICATE_MAX_DISTANCE, hammingDistance, simhash } from '@/lib/simhash';
import { analyzePdf, previewPageCount, renderPreviews } from '@/server/pdf/analyze';

import {
  makeEncryptedPdf,
  makeJavaScriptPdf,
  makeLaunchActionPdf,
  makeNotPdf,
  makePdf,
} from '../fixtures/pdf';

const MAX = 50 * 1024 * 1024;

describe('analyzePdf', () => {
  it('accepts a normal PDF and extracts page count, text and sha256', async () => {
    const result = await analyzePdf(await makePdf({ pages: 4 }), MAX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pageCount).toBe(4);
    expect(result.value.text).toContain('Kirhofovi zakoni');
    expect(result.value.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['a non-PDF file renamed to .pdf', () => Promise.resolve(makeNotPdf()), 'not_pdf'],
    ['an encrypted PDF', makeEncryptedPdf, 'encrypted'],
    ['a PDF with a JavaScript OpenAction', makeJavaScriptPdf, 'javascript'],
    ['a PDF with a Launch page action', makeLaunchActionPdf, 'javascript'],
  ])('rejects %s', async (_label, make, reason) => {
    const result = await analyzePdf(await make(), MAX);
    expect(result).toEqual({ ok: false, reason });
  });

  it('rejects a truncated PDF (repaired to nothing or unreadable)', async () => {
    const result = await analyzePdf((await makePdf()).subarray(0, 200), MAX);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(['corrupt', 'empty']).toContain(result.reason);
  });

  it('rejects files over the size limit', async () => {
    expect(await analyzePdf(await makePdf(), 100)).toEqual({ ok: false, reason: 'too_large' });
  });
});

describe('previews', () => {
  it.each([
    [1, 1],
    [6, 1],
    [10, 1],
    [14, 2],
    [20, 3],
    [200, 3],
  ])('%i pages → %i preview pages (min(3, 15%))', (pages, expected) => {
    expect(previewPageCount(pages, 3, 0.15)).toBe(expected);
  });

  it('renders WebP pages and blurs the last one', async () => {
    const previews = await renderPreviews(await makePdf({ pages: 3 }), 2);
    expect(previews.map((p) => [p.pageNumber, p.blurred])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(previews[0]?.webp.subarray(8, 12).toString()).toBe('WEBP');
    expect(previews[0]?.width).toBe(1000);
  });

  it('does not blur a single preview page (short notes would show nothing readable)', async () => {
    const previews = await renderPreviews(await makePdf({ pages: 10 }), 1);
    expect(previews.map((p) => [p.pageNumber, p.blurred])).toEqual([[1, false]]);
  });
});

describe('simhash', () => {
  it('is stable, close for near-duplicates and far for different texts', async () => {
    const base = (await analyzePdf(await makePdf({ pages: 6, seed: 'original' }), MAX)) as {
      ok: true;
      value: { text: string };
    };
    const near = (await analyzePdf(await makePdf({ pages: 6, seed: 'izmena' }), MAX)) as {
      ok: true;
      value: { text: string };
    };
    const other = (await analyzePdf(
      await makePdf({
        pages: 6,
        paragraphs: [
          'Integrali i izvodi su osnova matematicke analize.',
          'Limes niza postoji ako je niz konvergentan.',
          'Tejlorov red aproksimira funkciju polinomom.',
          'Diferencijalne jednacine opisuju promene.',
        ],
      }),
      MAX,
    )) as { ok: true; value: { text: string } };
    const a = simhash(base.value.text);
    const b = simhash(near.value.text);
    const c = simhash(other.value.text);
    expect(a).not.toBeNull();
    expect(simhash(base.value.text)).toBe(a);
    expect(hammingDistance(a as bigint, b as bigint)).toBeLessThanOrEqual(DUPLICATE_MAX_DISTANCE);
    expect(hammingDistance(a as bigint, c as bigint)).toBeGreaterThan(DUPLICATE_MAX_DISTANCE);
    expect(hammingDistance(a as bigint, c as bigint)).toBeGreaterThan(
      hammingDistance(a as bigint, b as bigint),
    );
  });

  it('returns null for texts too short to fingerprint', () => {
    expect(simhash('samo par reci')).toBeNull();
  });

  it('fits a signed 64-bit Postgres bigint', () => {
    const value = simhash(
      'reč '.repeat(10) + Array.from({ length: 60 }, (_, i) => `token${i}`).join(' '),
    ) as bigint;
    expect(value).toBeGreaterThanOrEqual(-(2n ** 63n));
    expect(value).toBeLessThan(2n ** 63n);
  });
});
