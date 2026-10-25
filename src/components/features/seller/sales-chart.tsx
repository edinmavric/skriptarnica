'use client';

import { useTranslations } from 'next-intl';
import { useState, type KeyboardEvent } from 'react';

import { formatPrice } from '@/lib/format';

interface Point {
  day: string;
  count: number;
  sellerPara: number;
}

const W = 600;
const H = 180;
const PAD = { top: 18, right: 8, bottom: 22, left: 28 };

function niceMax(value: number): number {
  if (value <= 4) return Math.max(value, 1);
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * pow) return step * pow;
  return 10 * pow;
}

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('sr-Latn-RS', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${iso}T12:00:00Z`),
  );

/**
 * Sales per day (single series → no legend; the heading names it). Columns ≤ 24px with 4px
 * rounded tops, hairline grid, value label on the peak only; tooltip on hover and on keyboard
 * focus (arrow keys move between days); the same numbers are in the table view.
 */
export function SalesChart({ data }: { data: Point[] }) {
  const t = useTranslations('seller.money.chart');
  const [active, setActive] = useState<number | null>(null);
  const maxCount = Math.max(...data.map((point) => point.count), 0);
  const top = niceMax(maxCount);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(24, band - 2);
  const y = (value: number) => PAD.top + innerH - (value / top) * innerH;
  const ticks = [0, top / 2, top].filter(
    (tick, index, list) => list.indexOf(tick) === index && Number.isInteger(tick),
  );
  const peak = data.reduce(
    (best, point, index) => (point.count > (data[best]?.count ?? 0) ? index : best),
    0,
  );
  const total = data.reduce((sum, point) => sum + point.count, 0);
  const current = active !== null ? data[active] : undefined;

  function onKey(event: KeyboardEvent) {
    if (event.key === 'ArrowRight') setActive((i) => Math.min((i ?? -1) + 1, data.length - 1));
    else if (event.key === 'ArrowLeft') setActive((i) => Math.max((i ?? data.length) - 1, 0));
    else if (event.key === 'Escape') setActive(null);
    else return;
    event.preventDefault();
  }

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">{t('summary', { total, days: data.length })}</figcaption>
      <div
        className="relative rounded-md focus-visible:outline-2 focus-visible:outline-pen"
        tabIndex={0}
        role="group"
        aria-label={t('keyboardHint')}
        onKeyDown={onKey}
        onFocus={() => setActive((i) => i ?? data.length - 1)}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" aria-hidden="true">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke="var(--rule)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-ink-muted text-[10px]"
              >
                {tick}
              </text>
            </g>
          ))}
          {data.map((point, index) => {
            const x = PAD.left + index * band + (band - barW) / 2;
            const h = Math.max(0, innerH - (y(point.count) - PAD.top));
            const r = Math.min(4, h / 2, barW / 2);
            const yTop = PAD.top + innerH - h;
            return (
              <g key={point.day} onPointerEnter={() => setActive(index)}>
                {/* Hit target = whole band, taller than the mark. */}
                <rect
                  x={PAD.left + index * band}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                />
                {h > 0 ? (
                  <path
                    d={`M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barW - r} Q${x + barW},${yTop} ${x + barW},${yTop + r} V${yTop + h} Z`}
                    fill="var(--chart-1)"
                    opacity={active === null || active === index ? 1 : 0.55}
                  />
                ) : null}
                {index === peak && point.count > 0 ? (
                  <text
                    x={x + barW / 2}
                    y={yTop - 5}
                    textAnchor="middle"
                    className="fill-ink text-[10px] font-semibold"
                  >
                    {point.count}
                  </text>
                ) : null}
              </g>
            );
          })}
          {[0, Math.floor(data.length / 2), data.length - 1].map((index) =>
            data[index] ? (
              <text
                key={index}
                x={PAD.left + index * band + band / 2}
                y={H - 6}
                textAnchor="middle"
                className="fill-ink-muted text-[10px]"
              >
                {dayLabel(data[index].day)}
              </text>
            ) : null,
          )}
          {active !== null ? (
            <line
              x1={PAD.left + active * band + band / 2}
              x2={PAD.left + active * band + band / 2}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--rule-strong)"
              strokeWidth={1}
            />
          ) : null}
        </svg>
        <p className="tabular min-h-6 text-sm" aria-live="polite">
          {current
            ? t('tooltip', {
                date: dayLabel(current.day),
                count: current.count,
                amount: formatPrice(current.sellerPara),
              })
            : ''}
        </p>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-muted">{t('table')}</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <thead>
            <tr className="border-b border-rule text-ink-muted">
              <th className="py-1 font-medium">{t('day')}</th>
              <th className="py-1 font-medium">{t('sales')}</th>
              <th className="py-1 font-medium">{t('earned')}</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {data.map((point) => (
              <tr key={point.day} className="border-b border-rule">
                <td className="py-1">{dayLabel(point.day)}</td>
                <td className="py-1">{point.count}</td>
                <td className="py-1">{formatPrice(point.sellerPara)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
