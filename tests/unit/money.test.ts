import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { calculateCommission, rsdToPara } from '@/lib/money';

describe('calculateCommission (rounded to whole dinars in the seller’s favor)', () => {
  it.each([
    [80000, 2000, 16000, 64000], // 800 RSD → platform 160, seller 640 (landing page example)
    [79900, 2000, 15900, 64000], // 799 RSD → 159,80 → 159
    [100, 2000, 0, 100], // 1 RSD → 0,20 → 0
    [0, 2000, 0, 0], // free notes
    [300000, 2000, 60000, 240000],
    [12345, 1500, 1800, 10545], // 123,45 RSD at 15% = 18,5175 → 18
    [99999, 2000, 19900, 80099],
  ])('price %i para @ %i bp → commission %i, seller %i', (price, bp, commission, seller) => {
    expect(calculateCommission(price, bp)).toEqual({
      commissionPara: commission,
      sellerPara: seller,
    });
  });

  it('never rounds against the seller and always sums to the price (property)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (price, bp) => {
          const { commissionPara, sellerPara } = calculateCommission(price, bp);
          expect(commissionPara + sellerPara).toBe(price);
          expect(commissionPara % 100).toBe(0);
          expect(commissionPara).toBeLessThanOrEqual((price * bp) / 10_000);
          expect(commissionPara).toBeGreaterThan((price * bp) / 10_000 - 100);
          expect(Number.isInteger(sellerPara)).toBe(true);
        },
      ),
    );
  });

  it('rejects floats and invalid percentages', () => {
    expect(() => calculateCommission(10.5, 2000)).toThrow(TypeError);
    expect(() => calculateCommission(100, 20.5)).toThrow(TypeError);
    expect(() => calculateCommission(100, 10_001)).toThrow(RangeError);
    expect(() => calculateCommission(-1, 2000)).toThrow(RangeError);
  });

  it('converts RSD to para without float drift', () => {
    expect(rsdToPara(800)).toBe(80000);
    expect(rsdToPara(12.34)).toBe(1234);
    expect(rsdToPara(0.1 + 0.2)).toBe(30);
  });
});
