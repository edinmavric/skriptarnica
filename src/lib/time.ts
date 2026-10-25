const ZONE = 'Europe/Belgrade';

/** Offset of Belgrade from UTC (ms) at a given instant, e.g. +1h in winter, +2h in summer. */
function zoneOffsetMs(instant: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: ZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** The instant a Belgrade calendar day (YYYY-MM-DD) starts, DST-aware. */
export function belgradeDayStart(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  const guess = Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1);
  // Two passes settle the offset even on DST change days.
  const first = guess - zoneOffsetMs(guess);
  return new Date(guess - zoneOffsetMs(first));
}
