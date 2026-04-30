import { useTheme } from '../lib/theme';

/// Three-segment theme picker: Light · Auto · Dark. Each mode is selectable
/// directly — light/dark are the primary modes, auto/system is the third
/// option that follows the OS preference. Sits next to the connect pill.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const modes = [
    { id: 'light' as const, label: 'Light', Icon: SunIcon },
    { id: 'system' as const, label: 'Auto', Icon: AutoIcon },
    { id: 'dark' as const, label: 'Dark', Icon: MoonIcon },
  ];

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex items-center h-8 rounded-md border border-ipe-stone-200 dark:border-ipe-green-500/30 bg-white/60 dark:bg-ipe-green-700/40 backdrop-blur-sm overflow-hidden"
    >
      {modes.map(({ id, label, Icon }) => {
        const active = theme === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setTheme(id)}
            title={label}
            aria-label={`${label} theme`}
            aria-pressed={active}
            className={`inline-flex items-center justify-center w-8 h-full transition-colors duration-200 ${
              active
                ? 'bg-ipe-gold/25 text-ipe-navy-700 dark:bg-ipe-gold/30 dark:text-ipe-gold'
                : 'text-ipe-ink-50 hover:text-ipe-ink dark:text-ipe-cream-100/60 dark:hover:text-ipe-cream-100'
            }`}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/// Half-filled circle — reads as "follow system" (half light, half dark).
function AutoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3a9 9 0 0 0 0 18V3z" fill="currentColor" />
    </svg>
  );
}
