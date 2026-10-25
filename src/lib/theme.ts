export const THEME_COOKIE = 'theme';
export const themes = ['system', 'light', 'dark'] as const;
export type Theme = (typeof themes)[number];

export function parseTheme(value: string | undefined): Theme {
  return themes.includes(value as Theme) ? (value as Theme) : 'system';
}
