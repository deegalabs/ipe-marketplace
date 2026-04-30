import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /// Ipê palette — kept the iconic green/gold/cream and added scales for
        /// modern UI work (subtle hover states, surface variations).
        ipe: {
          green: {
            50: '#eef5f2',
            100: '#d6e6e0',
            200: '#a8c9bc',
            300: '#74a895',
            400: '#3f7c69',
            500: '#1f5645',     // softer accent green
            600: '#0a3a2f',     // primary brand
            700: '#072721',     // deep / hover
            800: '#041a16',
            900: '#020e0c',
            DEFAULT: '#0a3a2f',
          },
          gold: {
            50: '#fef8e8',
            100: '#fdedc4',
            200: '#fadb88',
            300: '#f5c84c',
            400: '#f3c969',     // brand accent
            500: '#e0b04c',
            600: '#b88a32',
            DEFAULT: '#f3c969',
          },
          cream: {
            50: '#fdfbf6',
            100: '#f8f5ec',     // brand background
            200: '#efe9d8',
            300: '#e3dcc4',
            DEFAULT: '#f8f5ec',
          },
          /// `ink` is the primary text color. Driven by a CSS variable so it
          /// flips to cream in dark mode automatically — every text-ipe-ink/N,
          /// border-ipe-ink, etc. inherits without per-component dark variants.
          ink: {
            DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
            70: 'rgb(var(--color-ink) / 0.7)',
            50: 'rgb(var(--color-ink) / 0.5)',
            30: 'rgb(var(--color-ink) / 0.3)',
            10: 'rgb(var(--color-ink) / 0.1)',
          },
          /// Warm neutrals — subtle surfaces that don't fight the cream bg.
          stone: {
            50: '#f8f6f1',
            100: '#f1eee5',
            200: '#e3ddc9',
            300: '#cfc7ad',
            400: '#a89e7e',
          },
          /// Semantic — softer than Tailwind defaults so they sit on cream.
          success: '#2f7d5f',
          warn: '#c08a2b',
          danger: '#a8442a',
          info: '#3a6e94',
        },
      },
      fontFamily: {
        display: ['"InterDisplay"', '"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Modern hero scale, fluid-ish
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        display: ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.025em', fontWeight: '700' }],
        hero: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.022em', fontWeight: '700' }],
      },
      borderRadius: {
        '2xs': '4px',
        xs: '6px',
        sm: '8px',
        DEFAULT: '10px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '28px',
      },
      boxShadow: {
        // Tight, ink-tinted instead of pure black — feels warmer on cream.
        sm: '0 1px 2px 0 rgba(10, 58, 47, 0.06)',
        DEFAULT: '0 2px 8px -2px rgba(10, 58, 47, 0.08), 0 1px 2px 0 rgba(10, 58, 47, 0.04)',
        md: '0 6px 16px -4px rgba(10, 58, 47, 0.1), 0 2px 4px -1px rgba(10, 58, 47, 0.06)',
        lg: '0 12px 32px -8px rgba(10, 58, 47, 0.14), 0 4px 8px -2px rgba(10, 58, 47, 0.08)',
        xl: '0 24px 48px -12px rgba(10, 58, 47, 0.18)',
        glow: '0 0 0 4px rgba(243, 201, 105, 0.18)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.32, 0.72, 0.24, 1)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'fade-up': 'fade-up 350ms cubic-bezier(0.32, 0.72, 0.24, 1) both',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
      },
    },
  },
} satisfies Config;
