import { execSync } from 'node:child_process'
import type { IncomingMessage, ServerResponse } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { handleNews } from './api/news.ts'
import { handleWeather } from './api/weather.ts'

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

// /api/* locally: the same handlers the Vercel Functions run (api/*.ts), with the server-only keys from .env.
type Handler = (request: Request, env: Record<string, string>) => Promise<Response>
const API: Record<string, Handler> = { '/api/news': handleNews, '/api/weather': handleWeather }

function localApi(env: Record<string, string>): Plugin {
  const serve = async (handler: Handler, req: IncomingMessage, res: ServerResponse) => {
    try {
      const chunks: Buffer[] = []
      if (req.method === 'POST') for await (const c of req) chunks.push(c as Buffer)
      const headers = new Headers()
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
      const out = await handler(new Request(new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`), {
        method: req.method, headers, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      }), env)
      res.statusCode = out.status
      out.headers.forEach((v, k) => res.setHeader(k, v))
      res.end(await out.text())
    } catch {
      res.statusCode = 500
      res.end(JSON.stringify({ error: 'server error' }))
    }
  }
  // connect strips the mount path from req.url; the handlers only read the query string and body.
  // Returns nothing: a function returned from configureServer would be run by Vite as a post-middleware hook.
  const mount = (s: { middlewares: { use: (path: string, fn: (req: IncomingMessage, res: ServerResponse) => void) => unknown } }): void => {
    for (const [path, handler] of Object.entries(API)) s.middlewares.use(path, (req, res) => void serve(handler, req, res))
  }
  return { name: 'biyahe-local-api', configureServer: mount, configurePreviewServer: mount }
}

export default defineConfig(({ mode }) => ({
  define: { __BUILD__: JSON.stringify(buildStamp()) },
  plugins: [
    react(),
    localApi(loadEnv(mode, process.cwd(), '')),
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
        // Google Maps tiles/scripts are never stored (Google Maps Platform terms); the news copy lives in IndexedDB
        // with its own expiry (src/lib/news.ts). OpenStreetMap tiles the app shows are kept for a week so the
        // offline map has streets (OSM tile policy: clients should cache; no bulk download, see offlineTiles.ts).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 7 * 24 * 3600 },
              cacheableResponse: { statuses: [200] },
              matchOptions: { ignoreVary: true },
            },
          },
        ],
      },
    }),
  ],
}))
