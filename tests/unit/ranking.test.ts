import { describe, expect, it } from 'vitest';

import { controversy, hotRank, wilsonLowerBound } from '@/lib/ranking';

describe('hot rank', () => {
  const t = new Date('2026-10-25T12:00:00Z');
  it('is monotonic in score at a fixed time', () => {
    expect(hotRank(10, t)).toBeGreaterThan(hotRank(2, t));
    expect(hotRank(2, t)).toBeGreaterThan(hotRank(1, t));
    // As in Reddit's formula, log10(1) = 0: scores 1 and 0 tie on votes.
    expect(hotRank(1, t)).toBe(hotRank(0, t));
    expect(hotRank(0, t)).toBeGreaterThan(hotRank(-5, t));
  });

  it('newer posts outrank older ones with the same score', () => {
    expect(hotRank(5, new Date(t.getTime() + 3600_000))).toBeGreaterThan(hotRank(5, t));
  });

  it('10× the votes is worth 12.5 hours of age', () => {
    const older = hotRank(100, t);
    const newer = hotRank(10, new Date(t.getTime() + 12.5 * 3600_000));
    expect(older).toBeCloseTo(newer, 5);
  });
});

describe('controversial', () => {
  it('prefers balanced, high-volume disagreement', () => {
    expect(controversy(50, 50)).toBeGreaterThan(controversy(90, 10));
    expect(controversy(50, 50)).toBeGreaterThan(controversy(5, 5));
    expect(controversy(10, 0)).toBe(0);
    expect(controversy(0, 0)).toBe(0);
  });
});

describe('Wilson lower bound (Best)', () => {
  it('ranks 100/10 above 10/1 above 1/0 (confidence matters, not just ratio)', () => {
    expect(wilsonLowerBound(100, 10)).toBeGreaterThan(wilsonLowerBound(10, 1));
    expect(wilsonLowerBound(10, 1)).toBeGreaterThan(wilsonLowerBound(1, 0));
  });

  it('is 0 without votes and bounded by the observed ratio', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    const value = wilsonLowerBound(8, 2);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(0.8);
  });

  it('matches a reference value', () => {
    // n=10, p̂=0.8, z=1.2816: (0.8 + 0.0821 − 1.2816·√(0.0201)) / 1.1642 ≈ 0.6016
    expect(wilsonLowerBound(8, 2)).toBeCloseTo(0.6016, 3);
  });
});
