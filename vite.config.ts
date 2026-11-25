/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Type-only: this config is compiled without the WebWorker lib. Erased at build; the runtimeCaching
// function below is serialised into the service worker, where `self` is the worker global.
declare const self: { location: { origin: string } }

// Served from the custom domain https://ebook.fiddle.vn/ (root path). public/CNAME pins the domain.
const base = process.env.BASE_PATH ?? '/'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    // GitHub Pages serves the committed /docs folder of main (no CI).
    outDir: 'docs',
  },
  optimizeDeps: {
    exclude: ['foliate-js'],
  },
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Tủ truyện Fiddle',
        short_name: 'Tủ truyện Fiddle',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#faf6ee',
        theme_color: '#1f6f50',
        icons: [
          // Generated from public/favicon.svg by @vite-pwa/assets-generator (see scaffold.sh)
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,json}'],
        // Add runtimeCaching entries only for remote resources named in design.md.
        runtimeCaching: [
          {
            // Workbox serialises this function into the SW: it must not reference outer variables.
            urlPattern: ({ url }) =>
              /^\/books\/[a-z0-9-]+\/cover\.jpg$/.test(url.pathname) && url.origin !== self.location.origin,
            handler: 'CacheFirst',
            options: {
              cacheName: 'covers',
              expiration: { maxEntries: 3000, maxAgeSeconds: 31536000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/worker/**/*.test.ts', 'tests/deployer/**/*.test.{ts,tsx}'],
  },
})
