// Service-worker lifecycle (vite-plugin-pwa, generateSW, registerType 'autoUpdate').
//
// Production: the generated worker precaches the app shell and activates new versions at once (skipWaiting +
// clientsClaim, vite.config.ts). registerSW() then reloads open pages one time so they run the new bundle
// instead of the one they started with. A guard makes a reload loop impossible.
// Development: no worker is used. One left on this origin by `vite preview` or an earlier build would keep
// serving that build's precached app shell over the dev server, so it is removed.
import { registerSW } from 'virtual:pwa-register'

const RELOAD_KEY = 'biyahe-sw-reloaded-at'
export const RELOAD_GUARD_MS = 15_000

/** Reload for a new version unless one already happened moments ago (a second update in a row waits). */
export function shouldReload(now: number, last: number | null) {
  return last == null || !Number.isFinite(last) || now - last > RELOAD_GUARD_MS
}

function reloadOnce() {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY)
    if (!shouldReload(Date.now(), raw == null ? null : Number(raw))) return
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
  } catch {
    // storage blocked: the reload below still happens once per update event
  }
  location.reload()
}

export function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) {
    void navigator.serviceWorker.getRegistrations().then((rs) => {
      for (const r of rs) void r.unregister()
      if (rs.length) console.info(`[biyahe] Removed ${rs.length} service worker(s) left by a production build; dev runs without one.`)
    }).catch(() => {})
    return
  }
  // Runtime caches made by older versions (Open-Meteo weather, news responses): removed, since weather is no
  // longer stored and news has its own expiring copy in IndexedDB.
  if (typeof caches !== 'undefined') for (const name of ['weather', 'news']) void caches.delete(name).catch(() => {})
  registerSW({ immediate: true, onNeedReload: reloadOnce, onRegisterError: (e) => console.warn('[biyahe] Service worker not registered; the app still works online.', e) })
}
