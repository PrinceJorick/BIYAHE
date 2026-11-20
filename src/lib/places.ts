// Places a student can go to: their routes home (each a town) and the campus safe spots. Drives the Home
// recommendations, the "Available places" list, the details page (#/go/<kind>/<id>) and the map's destination.
// Pure, so the recommendation rules are tested (places.test.ts).
import { SPOT_SHORT_NAMES } from '../campuses'
import type { Corridor, CorridorState, Snapshot, Spot } from '../types'
import { fmtRange, isFull, spaceText } from './derive'
import type { LiveRoute } from './googleRoutes'
import { trafficFor, type TrafficReading } from './traffic'

export type RoutePlace = { kind: 'route'; id: string; corridor: Corridor; cs: CorridorState; traffic: TrafficReading; mine: boolean }
export type SpotPlace = { kind: 'spot'; id: string; spot: Spot; short: string; full: boolean }
export type Place = RoutePlace | SpotPlace

export const placeArg = (p: Pick<Place, 'kind' | 'id'>) => `${p.kind}/${p.id}`
export const placeTitle = (p: Place) => (p.kind === 'route' ? p.corridor.name : p.spot.name)
export const placeShort = (p: Place) => (p.kind === 'route' ? p.corridor.name : p.short)

export const shortSpotName = (s: Pick<Spot, 'id' | 'name'>) => SPOT_SHORT_NAMES[s.id] ?? s.name

/** Walking times are straight-line estimates (src/lib/coords.ts), always worded as approximate. */
export const walkText = (min: number) => `about ${min} min walk`

/** One line of facts about a place, for lists and tiles. */
export function placeFacts(p: Place) {
  if (p.kind === 'route') return `${p.traffic.level === 'closed' ? 'closed now' : fmtRange(p.traffic.minLo, p.traffic.minHi)} · via ${p.corridor.via}`
  return `${walkText(p.spot.walkMin)} · ${spaceText(p.spot)}`
}

export function routePlaces(snapshot: Snapshot, corridors: readonly Corridor[], live: Partial<Record<string, LiveRoute>> | null, mineId: string | null, now: number): RoutePlace[] {
  return corridors.map((corridor) => {
    const cs = snapshot.corridors[corridor.id]
    return { kind: 'route', id: corridor.id, corridor, cs, traffic: trafficFor(corridor, cs, live?.[corridor.id], now), mine: corridor.id === mineId }
  })
}

/** Safe spots, nearest first; full ones last. */
export function spotPlaces(spots: readonly Spot[]): SpotPlace[] {
  return [...spots]
    .sort((a, b) => Number(isFull(a)) - Number(isFull(b)) || a.walkMin - b.walkMin)
    .map((spot) => ({ kind: 'spot', id: spot.id, spot, short: shortSpotName(spot), full: isFull(spot) }))
}

/** `route/lipa` or `spot/gym` → the place, or null when it does not exist on this campus. */
export function findPlace(arg: string | null, routes: readonly RoutePlace[], spots: readonly SpotPlace[]): Place | null {
  if (!arg) return null
  const [kind, id] = arg.split('/')
  if (kind === 'route') return routes.find((r) => r.id === id) ?? null
  if (kind === 'spot') return spots.find((s) => s.id === id) ?? null
  return null
}

export type Option = { place: Place; verb: string; recommended: boolean }

const rank = { light: 0, moderate: 1, heavy: 2, closed: 3 }

/**
 * Three options for "Where do you want to go?". Your own route home first when it is open or slow; the nearest
 * safe spot with room first when it is closed (and that spot is then the recommendation). The third is the
 * least-delayed other open route, or another safe spot.
 */
export function recommend(routes: readonly RoutePlace[], spots: readonly SpotPlace[]): Option[] {
  const mine = routes.find((r) => r.mine) ?? routes[0]
  const nearest = spots.find((s) => !s.full)
  const closed = mine.cs.status === 'closed'
  const out: Option[] = []
  const add = (place: Place | undefined, verb: string) => {
    if (!place || out.some((o) => o.place.kind === place.kind && o.place.id === place.id)) return
    // Only an open/slow route or a safe spot with room is ever the recommendation.
    out.push({ place, verb, recommended: out.length === 0 && !(place.kind === 'route' && place.cs.status === 'closed') })
  }
  if (closed) {
    add(nearest, 'Wait at')
    add(mine, 'Route home')
  } else {
    add(mine, 'Head home to')
    add(nearest, 'Wait at')
  }
  const others = routes.filter((r) => !r.mine && r.cs.status !== 'closed').sort((a, b) => rank[a.traffic.level] - rank[b.traffic.level] || a.corridor.usualMin - b.corridor.usualMin)
  add(others[0], 'Suggested alternative')
  for (const s of spots) if (out.length < 3 && !s.full) add(s, 'Wait at')
  for (const r of routes) if (out.length < 3) add(r, 'Route')
  return out.slice(0, 3)
}

/** Why the first option is suggested: the rule applied and the facts it used, each with its source. */
export type Reason = { rule: string; facts: string[] }

const sourceWord = { official: 'official advisory', live: 'Google live traffic, estimate', estimate: 'estimate from route reports' } as const

/**
 * The explanation of recommend(): built only from the inputs it used, so it can never cite something BIYAHE did not
 * see. Rain and weather warnings are listed as context; they never change the route status on their own.
 */
export function recommendationReason(options: readonly Option[], ctx: { rainPeakPct: number | null; warnings: number }): Reason | null {
  const best = options.find((o) => o.recommended)
  const mine = options.map((o) => o.place).find((p): p is RoutePlace => p.kind === 'route' && p.mine)
  if (!best || !mine) return null
  const t = mine.traffic
  const facts = [
    mine.cs.status === 'closed'
      ? `${mine.corridor.name} via ${mine.corridor.via} is closed (${mine.cs.source}).`
      : `${mine.corridor.name} via ${mine.corridor.via}: ${t.level} traffic, about ${t.minLo}–${t.minHi} min now, usually ${mine.corridor.usualMin} min (${sourceWord[t.source]}).`,
  ]
  if (best.place.kind === 'spot') {
    const sp = best.place.spot
    facts.push(`${sp.name}: ${sp.capacity == null ? 'capacity not yet assessed, not confirmed' : `${sp.capacity - sp.occupied} of ${sp.capacity} spaces left`} (campus DRRMO count).`)
  }
  if (ctx.rainPeakPct != null && ctx.rainPeakPct >= 30) facts.push(`Up to ${ctx.rainPeakPct}% chance of rain in the next 6 hours (Google Weather forecast, estimate).`)
  if (ctx.warnings > 0) facts.push(`${ctx.warnings} weather warning${ctx.warnings > 1 ? 's' : ''} from PAGASA in force (official).`)
  const rule = best.place.kind === 'spot'
    ? 'Your usual route is closed by an advisory, so the nearest safe spot with room comes first.'
    : mine.cs.status === 'slow' ? 'Your usual route is open but slow, so it stays first; allow the longer time.' : 'Your usual route is open, so heading home comes first.'
  return { rule, facts }
}
