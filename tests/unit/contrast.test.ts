import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/** WCAG 2.x contrast checks for every token pair the UI uses, in both themes (SPEC §6.1). */

const css = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');

function tokensOf(selectorRegex: RegExp): Record<string, string> {
  const match = selectorRegex.exec(css);
  if (!match?.[1]) throw new Error(`Token block not found: ${String(selectorRegex)}`);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of match[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)) {
    if (name && value) tokens[name] = value.toLowerCase();
  }
  return tokens;
}

const light = tokensOf(/:root,\s*\[data-theme='light'\]\s*\{([^}]*)\}/);
const dark = tokensOf(/\n\[data-theme='dark'\]\s*\{([^}]*)\}/);
const darkSystem = tokensOf(
  /:root:not\(\[data-theme='light'\]\):not\(\[data-theme='dark'\]\)\s*\{([^}]*)\}/,
);

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const surfaces = ['paper', 'paper-sunk', 'paper-raised'];
/** [foreground, background, minimum ratio] */
const pairs: [string, string, number][] = [
  ...surfaces.flatMap((s): [string, string, number][] => [
    ['ink', s, 7],
    ['ink-muted', s, 4.5],
    ['ink-faint', s, 4.5],
    ['pen', s, 4.5],
    ['pen-hover', s, 4.5],
    ['success', s, 4.5],
    ['warning', s, 4.5],
    ['danger', s, 4.5],
    ['rule-strong', s, 1.7],
    ['field', s, 3],
    ['chart-1', s, 3],
  ]),
  ['pen-ink', 'pen', 4.5],
  ['pen-ink', 'pen-hover', 4.5],
  ['pen', 'pen-soft', 4.5],
  ['ink', 'pen-soft', 4.5],
  ['danger-ink', 'danger', 4.5],
  ['marker-ink', 'marker', 7],
  ['ink', 'marker-soft', 7],
  ['ink', 'marker-stroke', 4.5],
  ['success', 'success-soft', 4.5],
  ['warning', 'warning-soft', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['ink', 'success-soft', 4.5],
  ['ink', 'warning-soft', 4.5],
  ['ink', 'danger-soft', 4.5],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast', (_name, tokens) => {
  it.each(pairs)('%s on %s ≥ %s', (fg, bg, min) => {
    const f = tokens[fg];
    const b = tokens[bg];
    expect(f, `missing token ${fg}`).toBeDefined();
    expect(b, `missing token ${bg}`).toBeDefined();
    expect(contrast(f as string, b as string)).toBeGreaterThanOrEqual(min);
  });
});

describe('theme blocks', () => {
  it('system dark tokens match explicit dark tokens', () => {
    expect(darkSystem).toEqual(dark);
  });
  it('light and dark define the same tokens', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });
  it('backgrounds are not pure white or pure black', () => {
    for (const t of [light, dark]) {
      expect(t.paper).not.toBe('#ffffff');
      expect(t.paper).not.toBe('#000000');
    }
  });
});
