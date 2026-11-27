// Route status from hazards on the map: a flood closes every route that passes it, ponding slows every route
// that passes it, and every other route is clear. Geometry decides, so a flood on a road shared by several routes
// closes all of them, never just the one a fixture names. Pure (hazards.test.ts).
import type { Corridor, Hazard, LatLng } from '../types'

const R = 6_371_000
const rad = (d: number) => (d * Math.PI) / 180

/** Shortest distance in metres from a point to a path (segments, not just vertices). Local flat projection. */
export function distanceToPathM(p: LatLng, path: readonly LatLng[]): number {
  if (path.length === 0) return Infinity
  const k = Math.cos(rad(p[0]))
  const xy = ([lat, lng]: LatLng) => [rad(lng - p[1]) * k * R, rad(lat - p[0]) * R] as const
  let best = Infinity
  for (let i = 0; i < path.length; i++) {
    const [ax, ay] = xy(path[i])
    if (i === path.length - 1) {
      best = Math.min(best, Math.hypot(ax, ay))
      break
    }
    const [bx, by] = xy(path[i + 1])
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2))
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

/** Ids of the routes that pass within the hazard's radius. */
export const routesThrough = (h: Hazard, corridors: readonly Corridor[]) =>
  corridors.filter((c) => distanceToPathM(h.pos, c.path) <= h.radiusM).map((c) => c.id)

/** Each route's status and the hazard behind it: a flood wins over ponding; no hazard means open. */
export function hazardStatus(corridors: readonly Corridor[], hazards: readonly Hazard[]): Record<string, { status: 'open' | 'slow' | 'closed'; hazard: Hazard | null }> {
  const out: Record<string, { status: 'open' | 'slow' | 'closed'; hazard: Hazard | null }> = {}
  for (const c of corridors) out[c.id] = { status: 'open', hazard: null }
  for (const kind of ['ponding', 'flood'] as const) {
    for (const h of hazards.filter((x) => x.kind === kind)) {
      for (const id of routesThrough(h, corridors)) out[id] = { status: kind === 'flood' ? 'closed' : 'slow', hazard: h }
    }
  }
  return out
}
