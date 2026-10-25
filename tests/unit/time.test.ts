import { describe, expect, it } from 'vitest';

import { belgradeDayStart } from '@/lib/time';

describe('belgradeDayStart', () => {
  it('is UTC+1 in winter and UTC+2 in summer', () => {
    expect(belgradeDayStart('2026-01-15').toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(belgradeDayStart('2026-07-15').toISOString()).toBe('2026-07-14T22:00:00.000Z');
  });
  it('handles DST change days', () => {
    expect(belgradeDayStart('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(belgradeDayStart('2026-10-25').toISOString()).toBe('2026-10-24T22:00:00.000Z');
  });
});
