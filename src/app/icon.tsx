import { ImageResponse } from 'next/og';

import { colors, loadFonts } from '@/server/seo/og';

export const contentType = 'image/png';

const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType,
  }));
}

/**
 * App icon: a marker-underlined "S" in Piazzolla on paper. The letter stays inside the central
 * 60%, so the same image works as a maskable icon (PWA safe zone is the central 80%).
 */
export default async function Icon({ id }: { id: Promise<string> }) {
  const size = Number(await id);
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: colors.paper,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span
          style={{
            fontFamily: 'Piazzolla',
            fontWeight: 700,
            fontSize: size * 0.56,
            lineHeight: 1,
            color: colors.ink,
          }}
        >
          S
        </span>
        <span
          style={{
            width: size * 0.44,
            height: Math.max(2, size * 0.09),
            background: colors.marker,
            marginTop: -size * 0.07,
            borderRadius: size * 0.02,
          }}
        />
      </div>
    </div>,
    {
      width: size,
      height: size,
      fonts: (await loadFonts()).filter((font) => font.name === 'Piazzolla'),
    },
  );
}
