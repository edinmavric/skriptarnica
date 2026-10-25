import { Golos_Text, JetBrains_Mono, Piazzolla } from 'next/font/google';

/**
 * Self-hosted via next/font (SPEC §6.1). All three cover Latin Extended (č ć đ š ž) and Cyrillic.
 * Display: Piazzolla (sturdy serif with optical sizes); UI/body: Golos Text; mono: course codes only.
 */
export const piazzolla = Piazzolla({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-piazzolla',
});

export const golos = Golos_Text({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  display: 'swap',
  variable: '--font-golos',
});

export const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  display: 'swap',
  variable: '--font-jetbrains',
  preload: false,
});
