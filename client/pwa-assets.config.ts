import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      // Cream padding so the dark logo isn't clipped by Android's mask.
      padding: 0.4,
      resizeOptions: { background: '#f8f5ec' },
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0.3,
      resizeOptions: { background: '#0a3a2f' },
    },
  },
  images: ['public/icon-source.svg'],
});
