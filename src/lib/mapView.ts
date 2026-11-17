// Which points the corridor map fits its view to. Pure, so it can be tested without a DOM.
import type { Corridor, LatLng, Spot } from '../types'

export type MapMode = 'student' | 'staff'

export type MapFitInput = {
  campus: LatLng
  corridors: readonly Corridor[]
  // The student's own corridor (ignored in staff mode)
  corridor: Corridor
  spots: readonly Spot[]
}

// Current behaviour, unchanged: the first few waypoints of each path. This assumes short,
// hand-drawn paths; with dense road geometry it would only cover the first metres of a route.
// Staff: the first 3 points of every corridor. Student: campus, every spot, and path points 1–2.
export function mapFitPoints(mode: MapMode, { campus, corridors, corridor, spots }: MapFitInput): LatLng[] {
  return mode === 'staff'
    ? corridors.flatMap((c) => c.path.slice(0, 3))
    : [campus, ...spots.map((x) => x.pos), ...corridor.path.slice(1, 3)]
}

// Every point of every displayed path, plus campus and spots in student mode.
// Not used by the map yet; it replaces mapFitPoints once road geometry is approved.
export function fullFitPoints(mode: MapMode, { campus, corridors, corridor, spots }: MapFitInput): LatLng[] {
  return mode === 'staff'
    ? corridors.flatMap((c) => c.path)
    : [campus, ...spots.map((x) => x.pos), ...corridor.path]
}

// A cheap key that changes exactly when the list of points changes.
export const fitKey = (points: readonly LatLng[]) => points.map((p) => `${p[0]},${p[1]}`).join(';')
