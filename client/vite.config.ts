import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        // Activate new SW immediately and take control of open tabs without
        // waiting for them to close. Combined with `registerType: 'autoUpdate'`,
        // the page auto-reloads to pick up the new bundle on the next user
        // interaction — updates land within seconds of opening the app.
        // (Note: home-screen icons are owned by the OS, so ICON updates still
        // require uninstall+reinstall of the PWA.)
        skipWaiting: true,
        clientsClaim: true,
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
