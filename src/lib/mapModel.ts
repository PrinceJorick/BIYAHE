// What a map shows, independent of how it is drawn (Google Maps online, the app's simple map offline). Pure, so
// the rules are tested (mapModel.test.ts):
// - Route lines carry status by line pattern (solid open, dotted slow, dashed closed) and a text label; colour
//   only separates the route in focus (Deep Blue) from the others (Slate).
// - Google's road geometry is used when the map is Google's and Google returned it; otherwise the app's
//   OpenStreetMap-derived paths, which then need the OSM credit.
// - A walking route is drawn only when it is mapped geometry (never a straight line).
import type { Corridor, CorridorStatus, LatLng, Snapshot, Spot } from '../types'
import { isFull, spaceText } from './derive'
import { haversineM, pathLengthM } from './geo.js'
import type { LiveRoute } from './googleRoutes'
import { pathPrefix, NEARBY_ROUTE_M } from './mapView'
import { shortSpotName } from './places'
import type { WalkRoute } from './walkRoute'

export type MapLine = {
  id: string; path: LatLng[]; status: CorridorStatus; focus: boolean; name: string; via: string; source: 'google' | 'osm'
  /** Drawn in Deep Blue: the route in focus, or every route on the staff overview. Others are Slate. */
  strong: boolean
  /** Where the status label goes; null when the line is unlabelled (open, not in focus) or no clear spot exists. */
  labelAt: LatLng | null
}
export type MapSpot = { id: string; pos: LatLng; name: string; short: string; full: boolean; selected: boolean; label: string }
export type MapEnd = { id: string; pos: LatLng; name: string }
export type MapModel = { campus: LatLng; lines: MapLine[]; spots: MapSpot[]; ends: MapEnd[]; walk: LatLng[] | null; fit: LatLng[]; osmCredit: boolean }

export type MapFocus = { kind: 'route' | 'spot'; id: string } | null

/** Route status as words and levels for map labels (the status word is the only coloured text on a map). */
export const statusWord: Record<CorridorStatus, string> = { open: 'Open', slow: 'Slow', closed: 'Closed' }
export const statusLevel: Record<CorridorStatus, 'low' | 'mid' | 'high'> = { open: 'low', slow: 'mid', closed: 'high' }

export type MapModelInput = {
  mode: 'student' | 'staff'
  campus: LatLng
  corridors: readonly Corridor[]
  snapshot: Snapshot
  /** The student's own route. */
  mineId: string | null
  focus: MapFocus
  /** Student: draw every route, not only their own and the one in focus. */
  showAll: boolean
  /** Google geometry per route, used only when the map itself is Google's. */
  googlePaths: Partial<Record<string, LiveRoute>> | null
  walk: WalkRoute | null
  /** 'nearby' (default for spots): campus, safe spots and the first kilometre of the route. */
  extent?: 'route' | 'nearby'
}

export function buildMapModel(i: MapModelInput): MapModel {
  const focusRoute = i.focus?.kind === 'route' ? i.focus.id : null
  const focusSpot = i.focus?.kind === 'spot' ? i.focus.id : null
  const shown = i.mode === 'staff' || i.showAll
    ? i.corridors
    : i.corridors.filter((c) => c.id === i.mineId || c.id === focusRoute)
  // The line in focus: the chosen route, else (no spot chosen) the student's own route.
  const lineFocus = focusRoute ?? (focusSpot ? null : i.mineId)
  const lines: MapLine[] = shown.map((c) => {
    const g = i.googlePaths?.[c.id]?.path
    return {
      id: c.id, path: g ?? c.path, status: i.snapshot.corridors[c.id]?.status ?? 'open',
      focus: i.mode === 'staff' ? false : c.id === lineFocus, name: c.name, via: c.via, source: g ? 'google' : 'osm', labelAt: null,
      strong: i.mode === 'staff' || c.id === lineFocus,
    }
  })
  const chosenSpot = i.snapshot.spots.find((s) => s.id === focusSpot)
  const spots: MapSpot[] = i.snapshot.spots.map((s: Spot) => ({
    id: s.id, pos: s.pos, name: s.name, short: shortSpotName(s), full: isFull(s), selected: s.id === focusSpot,
    label: `${s.name}: ${spaceText(s)}${s.id === focusSpot ? ' (selected)' : ''}`,
  }))
  const ends: MapEnd[] = lines.filter((l) => l.focus).map((l) => ({ id: l.id, pos: l.path[l.path.length - 1], name: l.name }))
  const walk = chosenSpot && i.walk?.spotId === chosenSpot.id && (i.walk.mode === 'live' || i.walk.mode === 'cached') ? i.walk.path : null

  let fit: LatLng[]
  if (i.mode === 'staff' || (i.showAll && !i.focus)) fit = [i.campus, ...spots.map((s) => s.pos), ...lines.flatMap((l) => l.path)]
  else if (chosenSpot) fit = [i.campus, chosenSpot.pos, ...(walk ?? [])]
  else {
    const line = lines.find((l) => l.focus)
    const path = line ? (i.extent === 'nearby' ? pathPrefix(line.path, NEARBY_ROUTE_M) : line.path) : []
    fit = [i.campus, ...spots.map((s) => s.pos), ...path]
  }
  // Overview maps (staff, or every route) label only the route in focus and routes that are not open; the list
  // beside every overview map gives each route's status in text.
  const overview = i.mode === 'staff' || i.showAll
  placeLabels(lines.filter((l) => l.focus || l.status !== 'open' || !overview), fit, [i.campus, ...spots.map((x) => x.pos)])
  return { campus: i.campus, lines, spots, ends, walk, fit, osmCredit: lines.some((l) => l.source === 'osm') || walk != null }
}

/** The point `share` (0–1) of the way along a path, by distance. */
export function pointAlong(path: readonly LatLng[], share: number): LatLng {
  const p = pathPrefix(path, pathLengthM(path) * share)
  return p[p.length - 1]
}

const LABEL_SHARES = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]
/** Labels closer than this share of the view's diagonal would overlap on screen. */
export const LABEL_MIN_SEPARATION = 0.14

/**
 * Gives each line a label point (focus first) at the first candidate along its path that is far enough from every
 * pin and every label already placed, measured against the size of the fitted view. A line with no clear point gets no label:
 * a missing label is better than two overlapping ones.
 */
export function placeLabels(lines: MapLine[], fit: readonly LatLng[], obstacles: readonly LatLng[] = []) {
  if (fit.length === 0) return
  let [s, w, n, e] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lat, lng] of fit) { s = Math.min(s, lat); n = Math.max(n, lat); w = Math.min(w, lng); e = Math.max(e, lng) }
  const minSep = Math.max(150, haversineM([s, w], [n, e]) * LABEL_MIN_SEPARATION)
  // Pins (campus, safe spots) count as placed labels: a label never covers a pin.
  const placed: LatLng[] = [...obstacles]
  for (const l of [...lines].sort((a, b) => Number(b.focus) - Number(a.focus))) {
    if (l.path.length < 2) continue
    for (const share of LABEL_SHARES) {
      const p = pointAlong(l.path, share)
      if (placed.every((q) => haversineM(p, q) >= minSep)) {
        l.labelAt = p
        placed.push(p)
        break
      }
    }
  }
}
