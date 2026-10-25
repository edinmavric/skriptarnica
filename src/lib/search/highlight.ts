import { normalizeForSearch } from './normalize';

export interface Segment {
  text: string;
  match: boolean;
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/** Prefix match that tolerates Serbian case endings: "cacak" ~ "cacku" (u Čačku). */
function wordMatches(word: string, term: string): boolean {
  if (word.startsWith(term)) return true;
  return term.length >= 4 && commonPrefix(word, term) >= term.length - 2;
}

/**
 * Splits `text` into segments, marking words whose normalized form starts with a normalized
 * query term — so "cacak" highlights "Čačku" and "Чачак" highlights "Čačak".
 */
export function highlightSegments(text: string, query: string): Segment[] {
  const terms = normalizeForSearch(query)
    .split(' ')
    .filter((term) => term.length > 0);
  if (terms.length === 0) return [{ text, match: false }];
  const parts = text.split(/(\s+)/);
  const segments: Segment[] = [];
  for (const part of parts) {
    const normalized = normalizeForSearch(part);
    const match = normalized.length > 0 && terms.some((term) => wordMatches(normalized, term));
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += part;
    else segments.push({ text: part, match });
  }
  return segments;
}
