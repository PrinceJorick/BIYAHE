// Saves the OpenStreetMap street tiles around the campus and its routes so the offline map shows streets. The
// service worker (vite.config.ts, cache "osm-tiles") stores every tile request; this only asks for a small,
// fixed set once a week: zoom 11-13 over the area the routes cover, capped at MAX_TILES. That stays inside the
// OSM tile usage policy (no bulk downloads; under 250 tiles at zoom 13+ for later use).
import type { LatLng } from '../types'

export const TILE_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
export const OFFLINE_ZOOMS = [11, 12, 13]
export const MAX_TILES = 200
const WEEK_MS = 7 * 24 * 3_600_000
const STAMP = 'biyahe-osm-tiles-saved'

const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z)
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/**
 * Every tile covering the points' bounding box, widened by `pad` of its size on each side (the map shows a margin
 * around the routes), at the given zooms (smallest zoom first), at most `max`.
 */
export function tilesFor(points: readonly LatLng[], zooms = OFFLINE_ZOOMS, max = MAX_TILES, pad = 0.25): { z: number; x: number; y: number }[] {
  if (!points.length) return []
  const lats = points.map((p) => p[0])
  const lngs = points.map((p) => p[1])
  const [s0, n0, w0, e0] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const dy = pad > 0 ? Math.max((n0 - s0) * pad, 0.01) : 0
  const dx = pad > 0 ? Math.max((e0 - w0) * pad, 0.01) : 0
  const [s, n, w, e] = [s0 - dy, n0 + dy, w0 - dx, e0 + dx]
  const out: { z: number; x: number; y: number }[] = []
  for (const z of zooms) {
    for (let x = tileX(w, z); x <= tileX(e, z); x++) {
      for (let y = tileY(n, z); y <= tileY(s, z); y++) {
        if (out.length >= max) return out
        out.push({ z, x, y })
      }
    }
  }
  return out
}

/**
 * Asks for the tiles once a week, four at a time, only when a service worker can keep them. Never throws; a failed
 * tile is simply missing offline. Returns how many tiles were requested (0 when skipped).
 */
export async function saveOfflineTiles(points: readonly LatLng[], o: { fetchImpl?: typeof fetch; now?: number; force?: boolean } = {}): Promise<number> {
  const now = o.now ?? Date.now()
  try {
    if (!o.force && (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller)) return 0
    const last = Number(localStorage.getItem(STAMP))
    if (!o.force && Number.isFinite(last) && now - last < WEEK_MS) return 0
    localStorage.setItem(STAMP, String(now))
  } catch {
    if (!o.force) return 0
  }
  const queue = tilesFor(points)
  const get = o.fetchImpl ?? fetch
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) await get(TILE_URL(t.z, t.x, t.y), { mode: 'cors' }).catch(() => undefined)
  }
  const total = queue.length
  await Promise.all([worker(), worker(), worker(), worker()])
  return total
}
