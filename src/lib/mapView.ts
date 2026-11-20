// Map presentation rules shared by every map in the app (student and coordinator). Pure, so they can be
// tested without a DOM or Leaflet.
import type { Corridor, LatLng, Spot } from '../types'
import { haversineM } from './geo.js'

export type MapMode = 'student' | 'staff'
/**
 * How much of the student's own route the view covers:
 * - 'route'  — the whole route (the wide side pane, where the map is the main context)
 * - 'nearby' — campus, safe spots and the first NEARBY_ROUTE_M of the route (the narrow "Where to wait"
 *   map, where the safe spots are what matters)
 * Staff always see every corridor in full.
 */
export type MapExtent = 'route' | 'nearby'

// ── Zoom ────────────────────────────────────────────────────────────────────
/** Users cannot zoom out past the regional view or in past street level. 9 fits the longest trip (Alangilan to
 * Tanauan, about 33 km north) on a phone-sized map. */
export const MIN_ZOOM = 9
export const MAX_ZOOM = 18
/** Fitting never zooms in further than this, so a few close points don't produce a street-level view. */
export const FIT_MAX_ZOOM = 16
/** Space kept around the fitted features, in screen pixels (not a fraction of the extent). */
export const FIT_PADDING_PX = 28
/** Length of the student's route included by the 'nearby' extent. */
export const NEARBY_ROUTE_M = 1000

// ── Attribution ─────────────────────────────────────────────────────────────
/** Shown on every map in every mode (tiles on or off): the tiles and any reviewed road data are OSM data. */
export const OSM_ATTRIBUTION = Object.freeze({ text: '© OpenStreetMap contributors · ODbL', href: 'https://www.openstreetmap.org/copyright' })

export type MapFitInput = {
  campus: LatLng
  corridors: readonly Corridor[]
  /** The student's own corridor (ignored in staff mode). */
  corridor: Corridor
  spots: readonly Spot[]
}

/**
 * The start of a path, cut at `maxM` metres measured along it (the last point is interpolated). Returns the
 * whole path when it is shorter. Distance-based, so it covers the same ground whether the path has four
 * hand-drawn points or hundreds of road points.
 */
export function pathPrefix(path: readonly LatLng[], maxM: number): LatLng[] {
  if (path.length === 0) return []
  const out: LatLng[] = [path[0]]
  let done = 0
  for (let i = 1; i < path.length; i++) {
    const d = haversineM(path[i - 1], path[i])
    if (done + d >= maxM) {
      const t = d === 0 ? 0 : (maxM - done) / d
      out.push([path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t])
      return out
    }
    done += d
    out.push(path[i])
  }
  return out
}

/** The points the map view is fitted to: every displayed marker plus the displayed route geometry. */
export function mapFitPoints(mode: MapMode, extent: MapExtent, { campus, corridors, corridor, spots }: MapFitInput): LatLng[] {
  const markers: LatLng[] = [campus, ...spots.map((x) => x.pos)]
  if (mode === 'staff') return [...markers, ...corridors.flatMap((c) => c.path)]
  return [...markers, ...(extent === 'nearby' ? pathPrefix(corridor.path, NEARBY_ROUTE_M) : corridor.path)]
}

/** A cheap key that changes exactly when the list of points changes. */
export const fitKey = (points: readonly LatLng[]) => points.map((p) => `${p[0]},${p[1]}`).join(';')

// ── Fitted camera ───────────────────────────────────────────────────────────
/** Space kept clear for panels over the map, in screen px. */
export type FitPadding = { top: number; right: number; bottom: number; left: number }
export type FitCamera = { center: LatLng; zoom: number }

// Web Mercator with 256-px tiles (Google and Leaflet alike): x and y in [0, 1] across the world at zoom 0.
const TILE_PX = 256
const MERC_MAX_LAT = 85.0511287798
const mercX = (lng: number) => (lng + 180) / 360
const mercY = (lat: number) => {
  const s = Math.sin((Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, lat)) * Math.PI) / 180)
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}
const mercLat = (y: number) => (Math.atan(Math.sinh((0.5 - y) * 2 * Math.PI)) * 180) / Math.PI
const validPoint = ([lat, lng]: LatLng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
const padPx = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)

/**
 * The camera that fits `points` in a map of `size` px with `padding` px kept clear on each side: the largest whole
 * zoom (at most `maxZoom`, at least `minZoom`) at which the points' box fits the clear area, centred on that area
 * (not on the map, so uneven padding moves the centre). Same result as Leaflet's fitBounds with maxZoom, without
 * Google's fitBounds animation. Invalid points are ignored; null when there is nothing to fit or no room to fit it
 * (empty map, padding as large as the map), so the caller leaves the camera where it is.
 */
export function fitCamera(points: readonly LatLng[], size: { width: number; height: number }, padding: FitPadding,
  minZoom = MIN_ZOOM, maxZoom = FIT_MAX_ZOOM): FitCamera | null {
  const pts = points.filter(validPoint)
  if (pts.length === 0 || !(size.width > 0) || !(size.height > 0)) return null
  const top = padPx(padding.top), right = padPx(padding.right), bottom = padPx(padding.bottom), left = padPx(padding.left)
  const availW = size.width - left - right
  const availH = size.height - top - bottom
  if (availW < 1 || availH < 1) return null

  // Longitude: the narrowest span holding every point, which crosses the antimeridian when that is shorter.
  const xs = pts.map(([, lng]) => mercX(lng)).sort((a, b) => a - b)
  let west = xs[0], east = xs[xs.length - 1], gap = 1 - (east - west)
  for (let i = 1; i < xs.length; i++) {
    if (xs[i] - xs[i - 1] > gap) {
      gap = xs[i] - xs[i - 1]
      west = xs[i]
      east = xs[i - 1] + 1
    }
  }
  const ys = pts.map(([lat]) => mercY(lat))
  const north = Math.min(...ys), south = Math.max(...ys)
  const dx = east - west, dy = south - north

  // Whole zoom levels; the small epsilon keeps an exact fit from rounding down a level through float error.
  const fits = (avail: number, span: number) => (span > 0 ? Math.log2(avail / (TILE_PX * span)) : Infinity)
  const z = Math.floor(Math.min(fits(availW, dx), fits(availH, dy)) + 1e-9)
  const zoom = Math.max(minZoom, Math.min(maxZoom, z))

  // The box's centre sits at the centre of the clear area, which is offset from the map's centre by half the
  // difference between opposite paddings; the map centre is the box centre minus that offset.
  const world = TILE_PX * 2 ** zoom
  const cx = ((west + east) / 2) * world - (left - right) / 2
  const cy = ((north + south) / 2) * world - (top - bottom) / 2
  const x = (((cx / world) % 1) + 1) % 1
  const y = Math.max(0, Math.min(1, cy / world))
  return { center: [mercLat(y), x * 360 - 180], zoom }
}

// ── External directions ─────────────────────────────────────────────────────
/**
 * Google Maps walking directions to a point ([lat, lng]). Universal Maps URL: opens the Google Maps app on
 * phones and the website on desktop. This is Google's route, not one BIYAHE has checked.
 */
export function googleMapsDirectionsUrl([lat, lng]: LatLng): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new RangeError('googleMapsDirectionsUrl needs a valid [lat, lng]')
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}&travelmode=walking`
}

// ── Walking-time wording ────────────────────────────────────────────────────
/** Walking times are configured estimates, never measured or guaranteed. */
export const walkEstimate = (min: number) => `about ${min} min walk (estimate)`

// ── Reviewed road data (development warning) ────────────────────────────────
export type RoadDataStatus = { supplied: boolean; active: boolean; problems: readonly string[] }
/**
 * Development-only notice when reviewed road data was supplied but rejected (the map then shows the
 * hand-drawn routes). Callers pass `import.meta.env.DEV`; in production this is always null.
 */
export function devRoadDataWarning(status: RoadDataStatus, isDev: boolean): string | null {
  if (!isDev || !status.supplied || status.active) return null
  return `Reviewed road data invalid — showing hand-drawn routes (development warning; ${status.problems.length} problem${status.problems.length === 1 ? '' : 's'}, see console)`
}
