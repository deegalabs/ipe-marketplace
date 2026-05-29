import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Build-time constants exposed to the client for debug + support.
// On Vercel the SHA is provided as an env var; locally we shell out to git.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };
const sha = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_SHA__: JSON.stringify(sha),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' surfaces a "new version available" banner via useRegisterSW
      // instead of silently reloading. Users in the middle of typing/checkout
      // get a chance to finish before refreshing.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Ipê Store',
        short_name: 'Ipê Store',
        description: 'Onchain merch for the ipê.city community.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#eff2f1',
        theme_color: '#002642',
        lang: 'en',
        categories: ['shopping', 'finance'],
        icons: [
          { src: '/pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,woff2}'],
        // Privy/wagmi bundle is ~2.2 MB minified — bump the cache limit so it gets precached.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // IMPORTANT: do NOT set skipWaiting/clientsClaim here. With
        // `registerType: 'prompt'` the user clicks "Refresh" and the hook calls
        // updateServiceWorker(true), which triggers SKIP_WAITING and reloads.
        // Setting them to true here makes the SW activate on its own → no
        // waiting worker → the hook can't trigger reload, banner button gets
        // stuck on "Updating…". The hook owns the activation lifecycle.
        // Older precaches accumulate in storage when SW versions roll over —
        // wipe them so the user doesn't end up with stale assets.
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Cache the API catalog response so the shop loads while offline.
            // Stale-while-revalidate gets us instant render + background update.
            urlPattern: ({ url }) => url.pathname.startsWith('/products') || url.pathname.startsWith('/rates'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            // Product imagery on placehold.co — long-cache.
            urlPattern: /^https:\/\/placehold\.co\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: true,    // run the SW in `vite dev` so we can test install
        type: 'module',
      },
    }),
  ],
  server: { port: 5173 },
});
