// Walking directions from the campus point to a safe spot, with an honest label for where they came from.
//
//   live         OpenStreetMap walking route, fetched just now (FOSSGIS OSRM foot profile by default)
//   cached       the last live route for the same two points, saved on this device (IndexedDB 'routes' store)
//   estimate     no route available: straight-line distance only, at WALK_M_PER_MIN. No line is drawn, because
//                a straight line would look like a path someone checked.
//   unavailable  not even an estimate (invalid coordinates)
//
// No mode claims the path is safe or checked on site: OSM footpaths inside campuses are incomplete, and flooding
// or closed doors are not in the data. The UI says so next to every route.
//
// Pure apart from the injected fetch and cache, so every branch is unit-tested (walkRoute.test.ts).
import type { LatLng } from '../types'
import { haversineM, isValidLatLng, lngLatToLatLng, osrmPoint, walkMinutesFor } from './coords'
import { pathLengthM } from './geo.js'

export type WalkMode = 'live' | 'cached' | 'estimate' | 'unavailable'

export type WalkRoute = {
  mode: WalkMode
  spotId: string
  /** Drawn on the map only for live and cached routes. [lat, lng]. */
  path: LatLng[] | null
  distanceM: number | null
  minutes: number | null
  /** When the live route was fetched (live and cached). */
  fetchedAt: number | null
  /** Why a live route is not shown, for the UI and diagnostics. */
  reason: string | null
}

/** Bump when the cached record shape or the validation rules change: older cached routes are then ignored. */
export const WALK_ROUTE_VERSION = 1

/**
 * OSRM-compatible walking router. Override with VITE_WALK_ROUTER_URL (base URL up to, not including, /route);
 * set it to an empty string to turn live walking routes off. The default is the FOSSGIS public foot server
 * (routing.openstreetmap.de, fair-use: one request per safe-spot selection, cached).
 */
const envRouter = import.meta.env.VITE_WALK_ROUTER_URL as string | undefined
export const WALK_ROUTER_URL = envRouter === undefined ? 'https://routing.openstreetmap.de/routed-foot' : envRouter.replace(/\/+$/, '')

export const WALK_TIMEOUT_MS = 6000
/** A route whose ends snap further than this from the requested points does not reach the spot: rejected. */
export const MAX_SNAP_M = 60
/** A walking route on one campus longer than this many times the straight line is implausible: rejected. */
export const MAX_DETOUR = 6

export type CachedWalk = { v: number; from: LatLng; to: LatLng; path: LatLng[]; distanceM: number; fetchedAt: number }

export const walkCacheKey = (from: LatLng, to: LatLng) => `walk:v${WALK_ROUTE_VERSION}:${osrmPoint(from)};${osrmPoint(to)}`

export const walkRouteUrl = (base: string, from: LatLng, to: LatLng) =>
  `${base}/route/v1/foot/${osrmPoint(from)};${osrmPoint(to)}?overview=full&geometries=geojson&steps=false&alternatives=false`

const same = (a: LatLng, b: LatLng) => a[0] === b[0] && a[1] === b[1]

/**
 * Validates an OSRM response and returns the path from the requested origin to the requested destination.
 * The requested points are added at both ends (OSRM starts and ends at the snapped road points), so the drawn
 * line reaches the safe-spot marker. Returns null with a reason when the response cannot be trusted.
 */
export function parseOsrmWalk(json: unknown, from: LatLng, to: LatLng): { path: LatLng[]; distanceM: number } | { error: string } {
  const d = json as { code?: string; routes?: { distance?: number; geometry?: { type?: string; coordinates?: unknown[] } }[]; waypoints?: { distance?: number }[] }
  if (!d || d.code !== 'Ok') return { error: `router answered ${d?.code ?? 'nothing'}` }
  const r = d.routes?.[0]
  const coords = r?.geometry?.type === 'LineString' ? r.geometry.coordinates : undefined
  if (!Array.isArray(coords) || coords.length < 2) return { error: 'no route geometry' }
  let core: LatLng[]
  try {
    core = coords.map((p) => lngLatToLatLng(p as number[]))
  } catch {
    return { error: 'malformed coordinates' }
  }
  if (!core.every(isValidLatLng)) return { error: 'coordinates out of range' }
  const snapStart = haversineM(from, core[0])
  const snapEnd = haversineM(to, core[core.length - 1])
  if (snapStart > MAX_SNAP_M || snapEnd > MAX_SNAP_M) return { error: `route ends ${Math.round(Math.max(snapStart, snapEnd))} m from the requested point` }
  const path: LatLng[] = [from, ...core, to].filter((p, i, a) => i === 0 || !same(p, a[i - 1]))
  const distanceM = pathLengthM(path)
  const straight = haversineM(from, to)
  if (!Number.isFinite(distanceM) || distanceM <= 0) return { error: 'zero-length route' }
  if (distanceM > Math.max(straight * MAX_DETOUR, straight + 1500)) return { error: 'implausibly long detour' }
  return { path, distanceM }
}

/** Fetches a live walking route with a hard timeout. Throws on any failure (network, HTTP, invalid geometry). */
export async function fetchWalkRoute(from: LatLng, to: LatLng, { base = WALK_ROUTER_URL, fetchImpl = fetch, timeoutMs = WALK_TIMEOUT_MS } = {}) {
  if (!base) throw new Error('live walking routes are turned off')
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(walkRouteUrl(base, from, to), { signal: ctl.signal })
    if (!res.ok) throw new Error(`router HTTP ${res.status}`)
    const parsed = parseOsrmWalk(await res.json(), from, to)
    if ('error' in parsed) throw new Error(parsed.error)
    return parsed
  } catch (e) {
    throw new Error(ctl.signal.aborted ? `no answer within ${timeoutMs / 1000} s` : (e as Error).message || 'request failed', { cause: e })
  } finally {
    clearTimeout(timer)
  }
}

/** A cached record is used only if it is this version and for exactly these two points. */
export function validCached(c: unknown, from: LatLng, to: LatLng): c is CachedWalk {
  const x = c as CachedWalk | undefined
  return Boolean(x && x.v === WALK_ROUTE_VERSION && Array.isArray(x.path) && x.path.length >= 2 && x.path.every(isValidLatLng)
    && isValidLatLng(x.from) && isValidLatLng(x.to) && same(x.from, from) && same(x.to, to) && Number.isFinite(x.distanceM) && Number.isFinite(x.fetchedAt))
}

/** Deterministic fallback: straight-line distance and time, no path. */
export function estimateWalk(spotId: string, from: LatLng, to: LatLng, reason: string | null): WalkRoute {
  if (!isValidLatLng(from) || !isValidLatLng(to)) return { mode: 'unavailable', spotId, path: null, distanceM: null, minutes: null, fetchedAt: null, reason: 'invalid coordinates' }
  const distanceM = haversineM(from, to)
  return { mode: 'estimate', spotId, path: null, distanceM, minutes: walkMinutesFor(distanceM), fetchedAt: null, reason }
}

export type ResolveDeps = {
  /** Try the network (online, not simulated offline, not in Low-Battery Mode, router configured). */
  allowNetwork: boolean
  cacheGet: (key: string) => Promise<unknown>
  cacheSet: (key: string, value: CachedWalk) => Promise<void>
  fetchRoute?: typeof fetchWalkRoute
  now?: () => number
}

/** Live if possible, else the saved route for the same points, else the straight-line estimate. Never throws. */
export async function resolveWalkRoute(spotId: string, from: LatLng, to: LatLng, deps: ResolveDeps): Promise<WalkRoute> {
  if (!isValidLatLng(from) || !isValidLatLng(to)) return estimateWalk(spotId, from, to, null)
  const key = walkCacheKey(from, to)
  const now = deps.now ?? Date.now
  let reason: string | null = deps.allowNetwork ? null : 'offline or Low-Battery Mode'
  if (deps.allowNetwork) {
    try {
      const live = await (deps.fetchRoute ?? fetchWalkRoute)(from, to)
      const fetchedAt = now()
      await deps.cacheSet(key, { v: WALK_ROUTE_VERSION, from, to, path: live.path, distanceM: live.distanceM, fetchedAt }).catch(() => {})
      return { mode: 'live', spotId, path: live.path, distanceM: live.distanceM, minutes: walkMinutesFor(live.distanceM), fetchedAt, reason: null }
    } catch (e) {
      reason = (e as Error).message
    }
  }
  try {
    const cached = await deps.cacheGet(key)
    if (validCached(cached, from, to)) {
      return { mode: 'cached', spotId, path: cached.path, distanceM: cached.distanceM, minutes: walkMinutesFor(cached.distanceM), fetchedAt: cached.fetchedAt, reason }
    }
  } catch {
    // unreadable cache: fall through to the estimate
  }
  return estimateWalk(spotId, from, to, reason)
}

/** Human wording for a route's distance and time, always naming how it was worked out. */
export function walkSummary(r: WalkRoute): string {
  if (r.mode === 'unavailable' || r.minutes == null || r.distanceM == null) return 'Walking time unavailable'
  const m = r.distanceM < 1000 ? `${Math.round(r.distanceM / 10) * 10 || Math.round(r.distanceM)} m` : `${(r.distanceM / 1000).toFixed(1)} km`
  if (r.mode === 'estimate') return `about ${r.minutes} min walk · ${m} in a straight line (estimate)`
  return `about ${r.minutes} min walk · ${m} along mapped paths`
}
