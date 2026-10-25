import { describe, expect, it } from 'vitest';

import { lockSecondsFor } from '@/server/auth/lockout';
import { safeNextPath } from '@/lib/validation/auth';

describe('progressive lockout', () => {
  it.each([
    [1, 0],
    [4, 0],
    [5, 60],
    [6, 120],
    [8, 480],
    [20, 3600],
  ])('%i failures → %is lock', (failures, seconds) => {
    expect(lockSecondsFor(failures)).toBe(seconds);
  });
});

describe('safeNextPath (open redirect guard)', () => {
  it.each([
    ['/biblioteka', '/biblioteka'],
    ['/z/oet?sort=new', '/z/oet?sort=new'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['javascript:alert(1)', '/'],
    [undefined, '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});
