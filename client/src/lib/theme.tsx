import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
}

const KEY = 'ipe.theme';
const ctx = createContext<ThemeCtx | null>(null);

function systemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyToHtml(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  // Sync the theme-color meta so the iOS notch / Android status bar match.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#001627' : '#002642');
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem(KEY) as Theme | null) ?? 'system';
  });

  // The actual color scheme to render: `theme` if explicit, else system value.
  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    theme === 'system' ? systemPref() : (theme as 'light' | 'dark'),
  );

  useEffect(() => {
    const next: 'light' | 'dark' = theme === 'system' ? systemPref() : (theme as 'light' | 'dark');
    setResolved(next);
    applyToHtml(next);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  // React to OS theme changes when the user is on `system`.
  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next: 'light' | 'dark' = mql.matches ? 'dark' : 'light';
      setResolved(next);
      applyToHtml(next);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [theme]);

  return <ctx.Provider value={{ theme, resolved, setTheme: setThemeState }}>{children}</ctx.Provider>;
}

export function useTheme() {
  const v = useContext(ctx);
  if (!v) throw new Error('useTheme must be inside ThemeProvider');
  return v;
}
