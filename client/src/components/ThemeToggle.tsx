import { useTheme } from '../lib/theme';

/// Three-state toggle: light → dark → system → light.
/// Compact icon-only button — designed to sit next to the currency pill.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const icon = theme === 'light' ? '☀' : theme === 'dark' ? '☾' : '⌬';
  const label = theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Auto';
  return (
    <button
      onClick={() => setTheme(next)}
      title={`Theme: ${label} (click for ${next})`}
      aria-label={`Switch to ${next} theme`}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-ipe-stone-200 dark:border-ipe-green-500/30 bg-white/60 dark:bg-ipe-green-700/40 backdrop-blur-sm text-ipe-ink-70 dark:text-ipe-cream-100 hover:text-ipe-green-700 dark:hover:text-ipe-gold-DEFAULT transition-all duration-250 ease-smooth"
    >
      <span className="text-base leading-none">{icon}</span>
    </button>
  );
}
