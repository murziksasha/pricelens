import { translate, type Locale } from '@pricelens/shared';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface Prefs {
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<Prefs | null>(null);

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>((localStorage.getItem('pricelens.lang') as Locale) || 'en');
  const [theme, setThemeState] = useState<Theme>((localStorage.getItem('pricelens.theme') as Theme) || 'system');

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = resolveTheme(theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (theme === 'system') document.documentElement.dataset.theme = resolveTheme('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [locale, theme]);

  const value = useMemo<Prefs>(
    () => ({
      locale,
      theme,
      setLocale: (next) => {
        localStorage.setItem('pricelens.lang', next);
        setLocaleState(next);
      },
      setTheme: (next) => {
        localStorage.setItem('pricelens.theme', next);
        setThemeState(next);
      },
      t: (key, vars) => translate(locale, key, vars),
    }),
    [locale, theme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('prefs');
  return ctx;
}
