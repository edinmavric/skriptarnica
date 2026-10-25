import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { parseCsv, parseCsvRecords, toCsv } from '@/lib/csv';

describe('csv', () => {
  it('parses quotes, escaped quotes, newlines in fields, CRLF and a BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","He said ""hi"""\n"multi\nline",z\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'He said "hi"'],
      ['multi\nline', 'z'],
    ]);
  });
  it('detects semicolons (Excel in Serbian locale) and skips blank lines', () => {
    expect(parseCsvRecords('Fakultet;Predmet\n\netf-bg;Matematika 1\n')).toEqual([
      { fakultet: 'etf-bg', predmet: 'Matematika 1' },
    ]);
  });
  it('ignores semicolons inside quoted header fields', () => {
    expect(parseCsv('"a;b;c",d\n1,2')).toEqual([
      ['a;b;c', 'd'],
      ['1', '2'],
    ]);
  });
  it('neutralizes spreadsheet formulas but keeps negative numbers', () => {
    expect(toCsv([['=HYPERLINK("x")', '-15', '+1', '@a', 'ok']])).toBe(
      '﻿"\'=HYPERLINK(""x"")",-15,\'+1,\'@a,ok\r\n',
    );
  });
  it('round-trips arbitrary text', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(
            fc.string().filter((s) => !/^[=+\-@\t\r]/.test(s) && s.trim() !== ''),
            { minLength: 2, maxLength: 4 },
          ),
          { minLength: 1, maxLength: 5 },
        ),
        (rows) => {
          const width = rows[0]?.length ?? 0;
          const rect = rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? 'x'));
          expect(parseCsv(toCsv(rect))).toEqual(rect);
        },
      ),
    );
  });
});
