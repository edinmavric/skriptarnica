import { normalizeForSearch } from './search/normalize';

/**
 * URL slugs without diacritics (SPEC §8.3): č→c, ć→c, đ→dj, š→s, ž→z, Cyrillic transliterated.
 * "Osnovi elektrotehnike 1" → "osnovi-elektrotehnike-1".
 */
export function slugify(input: string, maxLength = 80): string {
  const slug = normalizeForSearch(input).replace(/ /g, '-');
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  const lastDash = cut.lastIndexOf('-');
  return lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut;
}
