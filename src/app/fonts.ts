import { JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';

/**
 * Self-hosted fonts (SPEC §6.1, §8.2). Piazzolla (display) and Golos Text (UI/body) are
 * variable fonts subset to what Serbian Latin needs: Basic Latin + Latin-1, č ć đ š ž and the
 * punctuation/symbols the UI uses (src/assets/fonts/web, built with fontTools; OFL texts
 * alongside). Weights: Piazzolla 600–800 (headings), Golos 400–700; Piazzolla's optical size is
 * pinned at its display default. Together ~58 KB instead of ~157 KB from the Google subsets,
 * which mattered on slow mobile connections. User-typed Cyrillic renders in the system font.
 */
export const piazzolla = localFont({
  src: [{ path: '../assets/fonts/web/piazzolla-sr.woff2', weight: '600 800', style: 'normal' }],
  display: 'swap',
  variable: '--font-piazzolla',
  fallback: ['Georgia', 'Times New Roman', 'serif'],
});

export const golos = localFont({
  src: [{ path: '../assets/fonts/web/golos-sr.woff2', weight: '400 700', style: 'normal' }],
  display: 'swap',
  variable: '--font-golos',
  fallback: ['system-ui', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
});

export const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-jetbrains',
  preload: false,
});
