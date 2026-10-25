import { describe, expect, it } from 'vitest';

import { cyrillicToLatin, normalizeForSearch, toPrefixTsQuery } from '@/lib/search/normalize';
import { slugify } from '@/lib/slug';

describe('normalizeForSearch', () => {
  it('treats Latin with and without diacritics and Cyrillic the same', () => {
    expect(normalizeForSearch('cacak')).toBe('cacak');
    expect(normalizeForSearch('Čačak')).toBe('cacak');
    expect(normalizeForSearch('Чачак')).toBe('cacak');
    expect(normalizeForSearch('ČAČAK')).toBe('cacak');
  });

  it('maps đ and Ђ to dj', () => {
    expect(normalizeForSearch('Đorđe')).toBe('djordje');
    expect(normalizeForSearch('Ђорђе')).toBe('djordje');
    expect(normalizeForSearch('djordje')).toBe('djordje');
  });

  it('handles the font test string', () => {
    expect(normalizeForSearch('Đorđe Čačak Šabac Žabalj Ćuprija — Ђорђе Чачак')).toBe(
      'djordje cacak sabac zabalj cuprija djordje cacak',
    );
  });

  it('handles digraph letters', () => {
    expect(normalizeForSearch('Љубљана Њиш џеп')).toBe('ljubljana njis dzep');
    expect(cyrillicToLatin('Ниш')).toBe('niš');
    expect(normalizeForSearch('Niš')).toBe('nis');
  });

  it('strips punctuation and collapses whitespace', () => {
    expect(normalizeForSearch('  OET-1:  Osnovi   elektrotehnike!! ')).toBe(
      'oet 1 osnovi elektrotehnike',
    );
  });

  it('builds a prefix tsquery', () => {
    expect(toPrefixTsQuery('Osn Elek')).toBe('osn:* & elek:*');
    expect(toPrefixTsQuery(' !!! ')).toBeNull();
    expect(toPrefixTsQuery("a' | b & !c")).toBe('a:* & b:* & c:*');
  });
});

describe('slugify', () => {
  it.each([
    ['Osnovi elektrotehnike 1', 'osnovi-elektrotehnike-1'],
    ['Elektrotehnički fakultet', 'elektrotehnicki-fakultet'],
    ['Đorđe Ćirić', 'djordje-ciric'],
    ['Машински факултет', 'masinski-fakultet'],
    ['  --Žabalj--  ', 'zabalj'],
  ])('%s → %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('truncates at a word boundary', () => {
    expect(slugify('a'.repeat(30) + ' ' + 'b'.repeat(60), 50)).toBe('a'.repeat(30));
  });
});
