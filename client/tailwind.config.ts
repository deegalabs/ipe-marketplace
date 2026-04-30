import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /// Official ipê.city palette (Brand Guide v2025).
        /// Primary navy + yellow + lime + sky on off-white / black.
        /// `ipe-green` namespace preserved as an alias for backward compat —
        /// it now resolves to the navy scale so existing classes still work.
        ipe: {
          /// Primary brand: deep navy (#002642). Used as headline color and
          /// dark surfaces. Scale generated around the brand value.
          navy: {
            50: '#e6edf2',
            100: '#bfcfd9',
            200: '#94aebd',
            300: '#688da0',
            400: '#3d6c84',
            500: '#1a4d6a',
            600: '#002642',     // brand
            700: '#001e34',
            800: '#001627',
            900: '#000d18',
            DEFAULT: '#002642',
          },
          /// Backward-compat alias: every text-ipe-green-* in the codebase
          /// keeps working but maps to the navy scale.
          green: {
            50: '#e6edf2',
            100: '#bfcfd9',
            200: '#94aebd',
            300: '#688da0',
            400: '#3d6c84',
            500: '#1a4d6a',
            600: '#002642',
            700: '#001e34',
            800: '#001627',
            900: '#000d18',
            DEFAULT: '#002642',
          },
          /// Yellow (#FFB600) — primary accent, replaces the muted gold.
          yellow: {
            50: '#fff7e0',
            100: '#ffe9b3',
            200: '#ffd366',
            300: '#ffc233',
            400: '#ffb600',     // brand
            500: '#cc9200',
            600: '#996e00',
            DEFAULT: '#ffb600',
          },
          /// Same alias trick for gold — tokens written before the rebrand
          /// keep rendering in the brand yellow.
          gold: {
            50: '#fff7e0',
            100: '#ffe9b3',
            200: '#ffd366',
            300: '#ffc233',
            400: '#ffb600',
            500: '#cc9200',
            600: '#996e00',
            DEFAULT: '#ffb600',
          },
          /// Lime green (#A2D729) — energetic accent, used on success states,
          /// "available" markers, and hero highlights.
          lime: {
            50: '#f4fae3',
            100: '#e3f3b8',
            200: '#cae87f',
            300: '#b2dd47',
            400: '#a2d729',     // brand
            500: '#7fab1e',
            600: '#5d7f15',
            DEFAULT: '#a2d729',
          },
          /// Sky blue (#3AA5FF) — secondary accent for info states + gradients.
          sky: {
            50: '#e6f3ff',
            100: '#b8dcff',
            200: '#7cc1ff',
            300: '#3aa5ff',     // brand
            400: '#1e8de6',
            500: '#0d70bf',
            600: '#085999',
            DEFAULT: '#3aa5ff',
          },
          /// Off-white (#EFF2F1) — replaces cream. Primary light surface.
          cream: {
            50: '#fbfcfb',
            100: '#eff2f1',     // brand
            200: '#e0e5e3',
            300: '#cad1ce',
            DEFAULT: '#eff2f1',
          },
          /// Black ink — driven by CSS variable so dark mode auto-flips to off-white.
          ink: {
            DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
            70: 'rgb(var(--color-ink) / 0.7)',
            50: 'rgb(var(--color-ink) / 0.5)',
            30: 'rgb(var(--color-ink) / 0.3)',
            10: 'rgb(var(--color-ink) / 0.1)',
          },
          /// Warm neutrals retained — useful for subtle borders.
          stone: {
            50: '#f8f9f8',
            100: '#eef0ef',
            200: '#dcdfdd',
            300: '#bfc4c1',
            400: '#8e9590',
          },
          /// Semantic — mapped to brand palette where possible.
          success: '#a2d729',     // lime
          warn: '#ffb600',        // yellow
          danger: '#cc3a2b',
          info: '#3aa5ff',        // sky
        },
      },
      fontFamily: {
        /// Brand typography (Brand Guide §13–14):
        /// Chakra Petch for titles, DM Sans for everything else.
        display: ['"Chakra Petch"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
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
        sm: '0 1px 2px 0 rgba(0, 38, 66, 0.06)',
        DEFAULT: '0 2px 8px -2px rgba(0, 38, 66, 0.08), 0 1px 2px 0 rgba(0, 38, 66, 0.04)',
        md: '0 6px 16px -4px rgba(0, 38, 66, 0.1), 0 2px 4px -1px rgba(0, 38, 66, 0.06)',
        lg: '0 12px 32px -8px rgba(0, 38, 66, 0.14), 0 4px 8px -2px rgba(0, 38, 66, 0.08)',
        xl: '0 24px 48px -12px rgba(0, 38, 66, 0.18)',
        glow: '0 0 0 4px rgba(255, 182, 0, 0.18)',
        'glow-lime': '0 0 0 4px rgba(162, 215, 41, 0.18)',
      },
      backgroundImage: {
        /// Brand gradient — soft blue/green/yellow blobs over navy. Used on
        /// hero sections and decorative surfaces.
        'ipe-blobs':
          'radial-gradient(circle at 20% 30%, #3aa5ff 0%, transparent 40%), radial-gradient(circle at 70% 60%, #a2d729 0%, transparent 45%), radial-gradient(circle at 60% 20%, #ffb600 0%, transparent 30%), #002642',
        'ipe-blobs-soft':
          'radial-gradient(circle at 20% 30%, rgba(58, 165, 255, 0.5) 0%, transparent 40%), radial-gradient(circle at 70% 60%, rgba(162, 215, 41, 0.45) 0%, transparent 45%), radial-gradient(circle at 60% 20%, rgba(255, 182, 0, 0.35) 0%, transparent 30%)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.32, 0.72, 0.24, 1)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: { '250': '250ms', '350': '350ms' },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'gradient-shift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'fade-up': 'fade-up 350ms cubic-bezier(0.32, 0.72, 0.24, 1) both',
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 12s ease-in-out infinite',
      },
    },
  },
} satisfies Config;
