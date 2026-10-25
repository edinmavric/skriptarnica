/**
 * Search normalization (SPEC §4.6). Applied before indexing and before querying, so that
 * "cacak", "Čačak" and "Чачак" all become "cacak", and "dj" matches "đ".
 */

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  ђ: 'đ',
  е: 'e',
  ж: 'ž',
  з: 'z',
  и: 'i',
  ј: 'j',
  к: 'k',
  л: 'l',
  љ: 'lj',
  м: 'm',
  н: 'n',
  њ: 'nj',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  ћ: 'ć',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'č',
  џ: 'dž',
  ш: 'š',
};

/** Serbian Cyrillic → Serbian Latin (keeps diacritics). Lowercases first. */
export function cyrillicToLatin(input: string): string {
  let out = '';
  for (const char of input.toLowerCase()) {
    out += CYRILLIC_TO_LATIN[char] ?? char;
  }
  return out;
}

/** Full normalization: lowercase, Cyrillic→Latin, đ→dj, strip diacritics, keep [a-z0-9 ]. */
export function normalizeForSearch(input: string): string {
  return cyrillicToLatin(input)
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a normalized query into terms for a prefix tsquery: "osn elek" → "osn:* & elek:*". */
export function toPrefixTsQuery(query: string): string | null {
  const terms = normalizeForSearch(query).split(' ').filter(Boolean).slice(0, 8);
  if (terms.length === 0) return null;
  return terms.map((term) => `${term}:*`).join(' & ');
}
