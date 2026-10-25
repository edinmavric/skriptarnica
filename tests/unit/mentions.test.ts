import { describe, expect, it } from 'vitest';

import { extractMentions } from '@/lib/mentions';

describe('extractMentions', () => {
  it('finds mentions at the start, after spaces and punctuation', () => {
    expect(extractMentions('@milica vidi ovo, (@djordje) i „@ana_99”')).toEqual([
      'milica',
      'djordje',
      'ana_99',
    ]);
  });
  it('ignores emails, code and too-short names, and trims a trailing period', () => {
    expect(extractMentions('piši na ana@etf.rs ili `@kod` i @ab, ali @pera.')).toEqual(['pera']);
    expect(extractMentions('```\n@blok\n```')).toEqual([]);
  });
  it('dedupes case-insensitively and caps the count', () => {
    expect(extractMentions('@Milica @milica')).toEqual(['milica']);
    const many = Array.from({ length: 20 }, (_, i) => `@user${i}x`).join(' ');
    expect(extractMentions(many)).toHaveLength(10);
  });
});
