// Saves the OpenStreetMap street tiles the offline map needs, for every campus, so the map stays a real street
// map without a connection. The service worker (vite.config.ts, cache "osm-tiles", kept 30 days) stores every tile
// request; this asks once a week for a small fixed set:
// - region: zoom 12-13 over each campus's routes (with a margin), so every route has street context, and the
//   overview zooms 9-11 with a wide margin, since overview maps are wider than the routes;
// - campus: zoom 14-16 within about a kilometre of each campus point and its safe spots.
// The map draws zoom-13 tiles under every closer zoom (src/components/map/SchematicMap.tsx), so streets stay
// visible, if softer, wherever no closer tile was saved. OSM tile usage policy: no bulk downloads; this stays under
// 250 tiles at zoom 13+ for later use (offlineTiles.test.ts).
import { campuses, CAMPUS_IDS } from '../campuses'
import type { Campus, LatLng } from '../types'

export type Tile = { z: number; x: number; y: number }

export const TILE_URL = (z: number, x: number, y: number) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
export const OFFLINE_ZOOMS = [12, 13]
/** Overview zooms: a few large tiles with a wide margin, since overview maps are wider than the routes they fit. */
export const OVERVIEW_ZOOMS = [9, 10, 11]
export const CAMPUS_ZOOMS = [14, 15, 16]
/** The highest zoom saved for whole regions: the offline base layer, drawn under every closer zoom. */
export const BASE_ZOOM = 13
export const MAX_TILES = 200
/** Half the side of the campus detail square, in degrees (about 0.9 km). */
const CAMPUS_RADIUS_DEG = 0.008
const WEEK_MS = 7 * 24 * 3_600_000
// v2: every campus, plus campus detail zooms. A new key makes devices that saved the v1 set fetch once more.
const STAMP = 'biyahe-osm-tiles-saved-v2'

const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z)
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)
}

/**
 * Every tile covering the points' bounding box, widened by `pad` of its size on each side (the map shows a margin
 * around the routes), at the given zooms (smallest zoom first), at most `max`.
 */
export function tilesFor(points: readonly LatLng[], zooms = OFFLINE_ZOOMS, max = MAX_TILES, pad = 0.25): Tile[] {
  if (!points.length) return []
  const lats = points.map((p) => p[0])
  const lngs = points.map((p) => p[1])
  const [s0, n0, w0, e0] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)]
  const dy = pad > 0 ? Math.max((n0 - s0) * pad, 0.01) : 0
  const dx = pad > 0 ? Math.max((e0 - w0) * pad, 0.01) : 0
  const [s, n, w, e] = [s0 - dy, n0 + dy, w0 - dx, e0 + dx]
  const out: Tile[] = []
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

/** One campus: its routes at region zooms, and the campus itself at street zooms. */
export function campusTiles(c: Campus): Tile[] {
  const [lat, lng] = c.location
  const around: LatLng[] = [[lat - CAMPUS_RADIUS_DEG, lng - CAMPUS_RADIUS_DEG], [lat + CAMPUS_RADIUS_DEG, lng + CAMPUS_RADIUS_DEG], ...c.spots.map((s) => s.pos)]
  const region: LatLng[] = [c.location, ...c.corridors.flatMap((r) => r.path), ...c.spots.map((s) => s.pos)]
  return [...tilesFor(region, OVERVIEW_ZOOMS, MAX_TILES, 1.5), ...tilesFor(region), ...tilesFor(around, CAMPUS_ZOOMS, MAX_TILES, 0)]
}

/** Every campus's tiles, each tile once (neighbouring campuses share region tiles). */
export function offlineTileSet(list: readonly Campus[] = CAMPUS_IDS.map((id) => campuses[id])): Tile[] {
  const seen = new Map<string, Tile>()
  for (const c of list) for (const t of campusTiles(c)) seen.set(`${t.z}/${t.x}/${t.y}`, t)
  return [...seen.values()]
}

/**
 * Asks for the tiles once a week, four at a time, only when a service worker can keep them. Never throws; a failed
 * tile is simply missing offline (the map then shows the zoom-13 streets, or a plain background). Returns how many
 * tiles were requested (0 when skipped).
 */
export async function saveOfflineTiles(tiles: readonly Tile[] = offlineTileSet(), o: { fetchImpl?: typeof fetch; now?: number; force?: boolean } = {}): Promise<number> {
  const now = o.now ?? Date.now()
  try {
    if (!o.force && (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller)) return 0
    const last = Number(localStorage.getItem(STAMP))
    if (!o.force && Number.isFinite(last) && now - last < WEEK_MS) return 0
    localStorage.setItem(STAMP, String(now))
  } catch {
    if (!o.force) return 0
  }
  const queue = [...tiles]
  const get = o.fetchImpl ?? fetch
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) await get(TILE_URL(t.z, t.x, t.y), { mode: 'cors' }).catch(() => undefined)
  }
  const total = queue.length
  await Promise.all([worker(), worker(), worker(), worker()])
  return total
}
