import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ipe: {
          green: '#0a3a2f',
          gold: '#f3c969',
          cream: '#f8f5ec',
          ink: '#0e0e0c',
        },
      },
      fontFamily: {
        display: ['"Inter"', 'system-ui', 'sans-serif'],
      },
    },
  },
} satisfies Config;
