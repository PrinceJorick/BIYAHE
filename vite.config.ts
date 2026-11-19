import { execSync } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { handleNews } from './api/news.ts'

// Which code a build contains (Setup → About this build). Vercel provides the commit; locally git does.
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

// /api/news locally: the same handler the Vercel Function runs (api/news.ts), with the server-only keys from .env.
function newsApi(env: Record<string, string>): Plugin {
  const serve = async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const out = await handleNews(new Request(new URL(req.url ?? '/', 'http://localhost')), env)
      res.statusCode = out.status
      out.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(await out.text())
    } catch (e) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: (e as Error).message }))
    }
  }
  // connect strips the mount path from req.url; the handler only reads the query string.
  // Returns nothing: a function returned from configureServer would be run by Vite as a post-middleware hook.
  const mount = (s: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => unknown } }): void => {
    s.middlewares.use('/api/news', (req, res) => void serve(req, res))
  }
  return { name: 'biyahe-news-api', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig(({ mode }) => ({
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  plugins: [
    react(),
    newsApi(loadEnv(mode, process.cwd(), '')),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered from src/lib/pwa.ts (reloads open pages once after an update; removes stray workers in dev).
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'BIYAHE',
        short_name: 'BIYAHE',
        description: 'Safer journeys, brighter tomorrows. Know when to head home, and where to wait if you shouldn\'t.',
        theme_color: '#0B2D5B',
        background_color: '#F1F5F9',
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
        // App shell + self-hosted fonts are precached. New versions take over at once and old precaches are
        // removed; incompatible data (snapshots, walking routes) is versioned in IndexedDB, not here.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Offline: any page path (e.g. a /map deep link) gets the app shell; the router turns it into #/map.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Google Maps tiles and scripts are never cached by the app (Google Maps Platform terms); offline, the app
        // shows its own simple map instead. Weather and news keep a short network-first copy.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.open-meteo\.com\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'weather', networkTimeoutSeconds: 4, expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: ({ url }) => url.pathname === '/api/news',
            handler: 'NetworkFirst',
            options: { cacheName: 'news', networkTimeoutSeconds: 5, expiration: { maxEntries: 6 } },
          },
        ],
      },
    }),
  ],
}))
