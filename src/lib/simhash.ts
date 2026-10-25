import { normalizeForSearch } from './search/normalize';

/**
 * 64-bit SimHash over 3-word shingles of normalized text (SPEC §4.4 duplicate detection).
 * Near-identical documents differ in few bits; we compare with Hamming distance.
 */
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = (1n << 64n) - 1n;

export function fnv1a64(input: string): bigint {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

/** Minimum number of words for a meaningful fingerprint (scans/near-empty PDFs return null). */
export const MIN_WORDS_FOR_SIMHASH = 30;

/** Returns a signed 64-bit value (fits Postgres bigint), or null for too-short texts. */
export function simhash(text: string): bigint | null {
  const words = normalizeForSearch(text)
    .split(' ')
    .filter((word) => word.length > 1);
  if (words.length < MIN_WORDS_FOR_SIMHASH) return null;
  const weights = new Array<number>(64).fill(0);
  for (let i = 0; i + 3 <= words.length; i += 1) {
    const hash = fnv1a64(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    for (let bit = 0; bit < 64; bit += 1) {
      weights[bit] = (weights[bit] ?? 0) + ((hash >> BigInt(bit)) & 1n ? 1 : -1);
    }
  }
  let result = 0n;
  for (let bit = 0; bit < 64; bit += 1) {
    if ((weights[bit] ?? 0) > 0) result |= 1n << BigInt(bit);
  }
  return BigInt.asIntN(64, result);
}

export function hammingDistance(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let count = 0;
  while (x) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}

/** Documents within this distance are flagged as possible duplicates/resale. */
export const DUPLICATE_MAX_DISTANCE = 6;
