import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { siteConfig } from '@/config/site';

export const OG_SIZE = { width: 1200, height: 630 } as const;

export const colors = {
  paper: '#fbfaf5',
  ink: '#1b1d22',
  muted: '#51565f',
  pen: '#1e3a9e',
  marker: '#e4f35a',
  rule: '#d6dde7',
};

let fonts: Promise<
  { name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }[]
> | null = null;

export function loadFonts() {
  const dir = join(process.cwd(), 'src/assets/fonts');
  fonts ??= Promise.all([
    readFile(join(dir, 'piazzolla-700.ttf')).then((data) => ({
      name: 'Piazzolla',
      data,
      weight: 700 as const,
      style: 'normal' as const,
    })),
    readFile(join(dir, 'golos-400.ttf')).then((data) => ({
      name: 'Golos',
      data,
      weight: 400 as const,
      style: 'normal' as const,
    })),
    readFile(join(dir, 'golos-600.ttf')).then((data) => ({
      name: 'Golos',
      data,
      weight: 600 as const,
      style: 'normal' as const,
    })),
  ]);
  return fonts;
}

/**
 * Open Graph card in the app's paper/marker style (SPEC §8.3): a ruled sheet, the title in
 * Piazzolla with the first words marked, context underneath, the wordmark at the bottom.
 * Long titles are clamped so nothing overflows the card.
 */
export async function renderOg({
  kicker,
  title,
  details,
  badge,
}: {
  kicker: string;
  title: string;
  details?: string | null;
  badge?: string | null;
}) {
  const clamped = title.length > 90 ? `${title.slice(0, 88).trimEnd()}…` : title;
  const size = clamped.length > 60 ? 58 : clamped.length > 36 ? 70 : 84;
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: colors.paper,
        padding: '64px 72px',
        fontFamily: 'Golos',
        color: colors.ink,
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent 47px, ${colors.rule} 47px, ${colors.rule} 48px)`,
      }}
    >
      <div style={{ display: 'flex', fontSize: 30, color: colors.pen, fontWeight: 600 }}>
        {kicker}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 28,
          fontFamily: 'Piazzolla',
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.08,
          letterSpacing: -1,
        }}
      >
        {clamped}
      </div>
      {details ? (
        <div style={{ display: 'flex', marginTop: 24, fontSize: 32, color: colors.muted }}>
          {details}
        </div>
      ) : null}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', fontFamily: 'Piazzolla', fontWeight: 700, fontSize: 44 }}>
          <span style={{ background: colors.marker, padding: '0 2px 0 6px', marginLeft: -6 }}>
            {siteConfig.name.slice(0, 6)}
          </span>
          <span>{siteConfig.name.slice(6)}</span>
        </div>
        {badge ? (
          <div
            style={{
              display: 'flex',
              fontSize: 36,
              fontWeight: 600,
              border: `3px solid ${colors.ink}`,
              borderRadius: 12,
              padding: '8px 22px',
              background: '#ffffff',
            }}
          >
            {badge}
          </div>
        ) : null}
      </div>
    </div>,
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}
