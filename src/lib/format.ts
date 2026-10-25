import { siteConfig } from '@/config/site';
import { PARA_PER_RSD } from '@/config/constants';

/** Formatting helpers (SPEC §6.3, §9). Serbian Latin, Europe/Belgrade. */
export const INTL_LOCALE = 'sr-Latn-RS';

const wholeNumber = new Intl.NumberFormat(INTL_LOCALE, { maximumFractionDigits: 0 });
const twoDecimals = new Intl.NumberFormat(INTL_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 125000 para → "1.250 RSD"; 125050 → "1.250,50 RSD". Input must be an integer number of para. */
export function formatPrice(para: number): string {
  if (!Number.isInteger(para)) {
    throw new TypeError(`formatPrice expects integer para, got ${para}`);
  }
  const negative = para < 0;
  const abs = Math.abs(para);
  const formatted =
    abs % PARA_PER_RSD === 0
      ? wholeNumber.format(abs / PARA_PER_RSD)
      : twoDecimals.format(abs / PARA_PER_RSD);
  return `${negative ? '−' : ''}${formatted} RSD`;
}

export function formatNumber(value: number): string {
  return wholeNumber.format(value);
}

const dateFormat = new Intl.DateTimeFormat(INTL_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: siteConfig.timeZone,
});
const dateTimeFormat = new Intl.DateTimeFormat(INTL_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: siteConfig.timeZone,
});

/** → "25. okt 2026." */
export function formatDate(date: Date | string): string {
  return dateFormat.format(new Date(date));
}

export function formatDateTime(date: Date | string): string {
  return dateTimeFormat.format(new Date(date));
}

const relative = new Intl.RelativeTimeFormat(INTL_LOCALE, { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

/** → "pre 3 sata", "juče", "sada". */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const diffSeconds = Math.round((new Date(date).getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  if (abs < 45) return relative.format(0, 'second');
  for (const [unit, seconds] of UNITS) {
    if (abs >= seconds || unit === 'second') {
      return relative.format(Math.round(diffSeconds / seconds), unit);
    }
  }
  return relative.format(0, 'second');
}
