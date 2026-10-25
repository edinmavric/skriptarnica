import { describe, expect, it } from 'vitest';

import { formatDate, formatPrice, formatRelative } from '@/lib/format';

describe('formatPrice', () => {
  it.each([
    [125000, '1.250 RSD'],
    [80000, '800 RSD'],
    [0, '0 RSD'],
    [125050, '1.250,50 RSD'],
    [1, '0,01 RSD'],
    [300000, '3.000 RSD'],
    [123456700, '1.234.567 RSD'],
    [-50000, '−500 RSD'],
  ])('%i para → %s', (para, expected) => {
    expect(formatPrice(para)).toBe(expected);
  });

  it('rejects floats', () => {
    expect(() => formatPrice(12.5)).toThrow(TypeError);
  });
});

describe('formatDate', () => {
  it('formats in Serbian with Belgrade time zone', () => {
    expect(formatDate('2026-10-25T10:00:00Z')).toBe('25. okt 2026.');
    // 23:30 UTC on Oct 24 is already Oct 25 in Belgrade (UTC+2 before DST ends).
    expect(formatDate('2026-10-24T23:30:00Z')).toBe('25. okt 2026.');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-10-25T12:00:00Z');
  it.each([
    ['2026-10-25T09:00:00Z', 'pre 3 sata'],
    ['2026-10-25T11:59:50Z', 'sada'],
    ['2026-10-24T12:00:00Z', 'juče'],
    ['2026-10-20T12:00:00Z', 'pre 5 dana'],
    ['2026-10-25T12:05:00Z', 'za 5 minuta'],
  ])('%s → %s', (date, expected) => {
    expect(formatRelative(date, now)).toBe(expected);
  });
});
