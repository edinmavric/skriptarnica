import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';

import en from '@/i18n/messages/en.json';
import sr from '@/i18n/messages/sr-Latn.json';

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[path] = value;
    else Object.assign(out, flatten(value, path));
  }
  return out;
}

const srFlat = flatten(sr as Messages);
const enFlat = flatten(en as Messages);

describe('i18n messages', () => {
  it('en skeleton has exactly the same keys as sr-Latn', () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(srFlat).sort());
  });

  it('every Serbian message is valid ICU', () => {
    for (const [key, message] of Object.entries(srFlat)) {
      expect(() => new IntlMessageFormat(message, 'sr-Latn'), key).not.toThrow();
    }
  });

  it('uses correct Serbian plurals', () => {
    const notes = new IntlMessageFormat(srFlat['notes.count'] as string, 'sr-Latn');
    expect(notes.format({ count: 1 })).toBe('1 skripta');
    expect(notes.format({ count: 2 })).toBe('2 skripte');
    expect(notes.format({ count: 5 })).toBe('5 skripti');
    expect(notes.format({ count: 21 })).toBe('21 skripta');
    expect(notes.format({ count: 22 })).toBe('22 skripte');
    expect(notes.format({ count: 11 })).toBe('11 skripti');
    expect(notes.format({ count: 12 })).toBe('12 skripti');
  });

  it('avoids the empty marketing phrases banned by SPEC §6.2', () => {
    const banned = ['revolucioniš', 'otključaj', 'sve na jednom mestu', 'bez muke'];
    for (const [key, message] of Object.entries(srFlat)) {
      for (const phrase of banned) {
        expect(message.toLowerCase().includes(phrase), `${key} contains "${phrase}"`).toBe(false);
      }
    }
  });
});
