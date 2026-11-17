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
/** Users cannot zoom out past the regional view or in past street level. */
export const MIN_ZOOM = 10
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
