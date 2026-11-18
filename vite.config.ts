import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Which code a build contains (Profile → About this build). Vercel provides the commit; locally git does.
function buildStamp() {
  const git = (cmd: string) => {
    try {
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      return ''
    }
  }
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || git('git rev-parse --short HEAD') || 'unknown'
  return { commit, dirty: !process.env.VERCEL && git('git status --porcelain') !== '', builtAt: new Date().toISOString() }
}

export default defineConfig({
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/lib/pwa.ts (reloads open pages once after an update; removes stray workers in dev).
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'BIYAHE',
        short_name: 'BIYAHE',
        description: "Know when to head home, and where to wait if you shouldn't.",
        theme_color: '#0B2D5B',
        background_color: '#F8FAFC',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        // App shell + self-hosted Poppins are precached. New versions take over at once and old precaches are
        // removed; incompatible data (snapshots, walking routes) is versioned in IndexedDB, not here.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Offline: any path (e.g. a /map deep link) gets the app shell; the router turns it into #/map.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 400 } },
          },
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'weather', networkTimeoutSeconds: 4, expiration: { maxEntries: 4 } },
          },
        ],
      },
    }),
  ],
})
