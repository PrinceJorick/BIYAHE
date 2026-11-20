// Google Maps Platform: Routes API (REST, called from the browser; the API allows CORS) with the same browser
// key as the Maps JavaScript API. One computeRoutes call per route gives the traffic-aware duration, the
// no-traffic duration and Google's road geometry, so the drawn line matches Google's map exactly.
// Pure apart from the injected fetch, so parsing and failure handling are unit-tested (googleRoutes.test.ts).
import type { LatLng } from '../types'
import { isValidLatLng } from './coords'

export const GOOGLE_MAPS_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '').trim()
// Optional separate Routes API key; falls back to the Maps key.
export const GOOGLE_ROUTES_KEY = (import.meta.env.VITE_GOOGLE_ROUTES_API_KEY ?? '').trim() || GOOGLE_MAPS_KEY
export const GOOGLE_MAP_ID = (import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? '').trim()

export const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
export const ROUTES_FIELD_MASK = 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline'
export const ROUTES_TIMEOUT_MS = 8000

/** One route from Google: traffic-aware and free-flow durations (seconds), length and road geometry. */
export type LiveRoute = { durationS: number; staticS: number; distanceM: number; path: LatLng[] | null; fetchedAt: number }

/** Google's encoded polyline (precision 5) → [lat, lng][]. Throws on a truncated string. */
export function decodePolyline(encoded: string): LatLng[] {
  const out: LatLng[] = []
  let i = 0
  let lat = 0
  let lng = 0
  const next = () => {
    let shift = 0
    let result = 0
    let b: number
    do {
      if (i >= encoded.length) throw new RangeError('truncated polyline')
      b = encoded.charCodeAt(i++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < encoded.length) {
    lat += next()
    lng += next()
    out.push([lat / 1e5, lng / 1e5])
  }
  return out
}

const seconds = (v: unknown) => {
  const n = typeof v === 'string' ? Number.parseFloat(v.replace(/s$/, '')) : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

export type TravelMode = 'DRIVE' | 'WALK'

/** Request body for one origin → destination route. `departureTime` (ms) must be in the future for a forecast. */
export function routesRequestBody(from: LatLng, to: LatLng, { mode = 'DRIVE', departureTime }: { mode?: TravelMode; departureTime?: number } = {}) {
  const point = ([latitude, longitude]: LatLng) => ({ location: { latLng: { latitude, longitude } } })
  return {
    origin: point(from),
    destination: point(to),
    travelMode: mode,
    // Traffic applies to driving only; the API rejects a routing preference for walking.
    ...(mode === 'DRIVE' ? { routingPreference: 'TRAFFIC_AWARE' } : {}),
    ...(departureTime != null ? { departureTime: new Date(departureTime).toISOString() } : {}),
    languageCode: 'en-PH',
    regionCode: 'PH',
    units: 'METRIC',
  }
}

/** Validates a computeRoutes response. */
export function parseComputeRoutes(json: unknown): Omit<LiveRoute, 'fetchedAt'> | { error: string } {
  const d = json as { routes?: { duration?: string; staticDuration?: string; distanceMeters?: number; polyline?: { encodedPolyline?: string } }[]; error?: { message?: string } }
  if (d?.error) return { error: d.error.message ?? 'Routes API error' }
  const r = d?.routes?.[0]
  if (!r) return { error: 'no route found' }
  const durationS = seconds(r.duration)
  const staticS = seconds(r.staticDuration) ?? durationS
  if (durationS == null || staticS == null || staticS === 0) return { error: 'route has no duration' }
  const distanceM = typeof r.distanceMeters === 'number' && Number.isFinite(r.distanceMeters) ? r.distanceMeters : 0
  let path: LatLng[] | null = null
  if (typeof r.polyline?.encodedPolyline === 'string') {
    try {
      const p = decodePolyline(r.polyline.encodedPolyline)
      path = p.length >= 2 && p.every(isValidLatLng) ? p : null
    } catch {
      path = null
    }
  }
  return { durationS, staticS, distanceM, path }
}

export type RouteFetchOptions = { key?: string; mode?: TravelMode; departureTime?: number; fetchImpl?: typeof fetch; timeoutMs?: number; now?: () => number }

/** Fetches one route. Throws with a short reason on any failure (no key, network, HTTP, invalid answer). */
export async function fetchGoogleRoute(from: LatLng, to: LatLng, o: RouteFetchOptions = {}): Promise<LiveRoute> {
  const key = o.key ?? GOOGLE_ROUTES_KEY
  if (!key) throw new Error('no Google Maps key')
  const ctl = new AbortController()
  const timeoutMs = o.timeoutMs ?? ROUTES_TIMEOUT_MS
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await (o.fetchImpl ?? fetch)(ROUTES_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': ROUTES_FIELD_MASK },
      body: JSON.stringify(routesRequestBody(from, to, o)),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? `Routes API HTTP ${res.status}`)
    const parsed = parseComputeRoutes(body)
    if ('error' in parsed) throw new Error(parsed.error)
    return { ...parsed, fetchedAt: (o.now ?? Date.now)() }
  } catch (e) {
    throw new Error(ctl.signal.aborted ? `no answer within ${timeoutMs / 1000} s` : (e as Error).message || 'request failed', { cause: e })
  } finally {
    clearTimeout(timer)
  }
}
