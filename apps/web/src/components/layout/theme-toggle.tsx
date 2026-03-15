'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';

type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'lightboard-theme';
const THEMES: Theme[] = ['system', 'light', 'dark'];

/** Reads the stored theme preference from localStorage. */
function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'system';
}

/** Applies the theme by toggling .dark/.light classes on html. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove('dark', 'light');

  if (theme === 'dark') {
    root.classList.add('dark');
  } else if (theme === 'light') {
    root.classList.add('light');
  } else {
    // System: follow OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('dark');
    }
  }
}

/** Three-state theme toggle: System → Light → Dark → System. */
export function ThemeToggle() {
  const t = useTranslations('nav');
  const [theme, setTheme] = useState<Theme>('system');

  // Initialize from localStorage on mount + listen for system changes
  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);

    // Listen for OS theme changes when in "system" mode
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getStoredTheme() === 'system') {
        applyTheme('system');
      }
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const cycleTheme = useCallback(() => {
    const currentIdx = THEMES.indexOf(theme);
    const next = THEMES[(currentIdx + 1) % THEMES.length]!;
    setTheme(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }, [theme]);

  const icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const Icon = icon;
  const label = theme === 'dark' ? t('themeDark') : theme === 'light' ? t('themeLight') : t('themeSystem');

  return (
    <button
      onClick={cycleTheme}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
      title={label}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
