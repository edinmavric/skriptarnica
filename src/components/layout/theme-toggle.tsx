'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { MonitorIcon, MoonIcon, SunIcon } from '@/components/ui/icons';
import { THEME_COOKIE, type Theme } from '@/lib/theme';

const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const icons = { system: MonitorIcon, light: SunIcon, dark: MoonIcon } as const;

/**
 * Cycles system → light → dark. The choice is stored in a cookie and applied on the server
 * (<html data-theme>), so there is no flash on load.
 */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const t = useTranslations('layout.theme');
  const [theme, setTheme] = useState<Theme>(initial);
  const Icon = icons[theme];
  return (
    <button
      type="button"
      onClick={() => {
        const value = next[theme];
        setTheme(value);
        document.documentElement.dataset.theme = value;
        document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
      }}
      className="grid size-11 place-items-center rounded-md text-ink-muted hover:bg-paper-sunk hover:text-ink"
      aria-label={t('toggle', { current: t(theme) })}
      title={t('toggle', { current: t(theme) })}
    >
      <Icon className="size-5" />
    </button>
  );
}
