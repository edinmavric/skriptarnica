import { PARA_PER_RSD } from '@/config/constants';

/**
 * Money is always an integer number of para (SPEC §0.6). These helpers never produce floats.
 */

export function assertPara(value: number, label = 'amount'): void {
  if (!Number.isSafeInteger(value))
    throw new TypeError(`${label} must be an integer number of para, got ${value}`);
}

export function rsdToPara(rsd: number): number {
  const para = Math.round(rsd * PARA_PER_RSD);
  assertPara(para);
  return para;
}

/**
 * Platform commission (SPEC §5.4): percentage of the price, rounded DOWN to whole dinars —
 * i.e. in the seller's favor. 799 RSD at 20% = 159,80 → 159 RSD commission, seller gets 640.
 * `percentBasisPoints` avoids float percentages: 20% = 2000.
 */
export function calculateCommission(
  pricePara: number,
  percentBasisPoints: number,
): { commissionPara: number; sellerPara: number } {
  assertPara(pricePara, 'price');
  assertPara(percentBasisPoints, 'percent');
  if (pricePara < 0) throw new RangeError('price must not be negative');
  if (percentBasisPoints < 0 || percentBasisPoints > 10_000)
    throw new RangeError('percent must be between 0 and 100%');
  // Integer arithmetic: price * bp / 10000, then floor to whole dinars.
  const rawPara = Math.floor((pricePara * percentBasisPoints) / 10_000);
  const commissionPara = Math.floor(rawPara / PARA_PER_RSD) * PARA_PER_RSD;
  return { commissionPara, sellerPara: pricePara - commissionPara };
}

export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}
