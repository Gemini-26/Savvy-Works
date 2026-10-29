import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),   // ← this is what was missing; processes all Tailwind classes
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Savvy Civils and Plumbing',
        short_name: 'Savvy Works',
        description: 'Job Management System',
        theme_color: '#CC2525',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // The face library is a 1.3 MB chunk only people who clock in with
        // their face need; it's cached at runtime (below) instead of being
        // downloaded by every device that installs the app.
        globIgnores: ['**/face-api*.js'],
        navigateFallbackDenylist: [/^\/api/],
        // The single app bundle sits just over workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // The face library and its models (~7 MB) are fetched the first time
        // someone clocks in with their face, then kept so field staff on
        // mobile data never download them twice.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/models/face/') || /^\/assets\/face-api/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'face-models',
              expiration: { maxEntries: 10 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    // Pre-bundle at server start so adding a new dep (e.g. jspdf) never triggers
    // a surprise full-page reload mid-session when it's first hit by a click.
    include: ['jspdf'],
  },
})
