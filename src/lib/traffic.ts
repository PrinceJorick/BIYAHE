// Traffic on each route home, and the "When should I leave?" options. Pure (no fetching), so every rule is tested.
//
// Official route status always wins: a route the DRRMO or LGU marked closed is "Closed" whatever traffic data
// says, and a route reported slow (ponding, heavy traffic) is never shown as better than that report. Live Google
// traffic can only make a route look worse than its official status, or give the current figure for an open one.
import type { Corridor, CorridorState, CorridorStatus, HourForecast } from '../types'
import type { LiveRoute } from './googleRoutes'
import { hourAt } from './weather'

export type TrafficLevel = 'light' | 'moderate' | 'heavy' | 'closed'
/** low → high, for colouring level text (the only colour the UI uses for meaning). */
export type Level = 'low' | 'mid' | 'high' | 'none'

export const levelOfTraffic: Record<TrafficLevel, Level> = { light: 'low', moderate: 'mid', heavy: 'high', closed: 'high' }
export const trafficWord: Record<TrafficLevel, string> = { light: 'Light', moderate: 'Moderate', heavy: 'Heavy', closed: 'Closed' }

/** Traffic-aware ÷ free-flow travel time → level. */
export const levelFromRatio = (ratio: number): Exclude<TrafficLevel, 'closed'> => (ratio < 1.25 ? 'light' : ratio < 1.6 ? 'moderate' : 'heavy')

// What an official status implies, as a delay ratio (slow: the middle of corridorStateFor's 1.4–1.85 band).
const STATUS_RATIO: Record<Exclude<CorridorStatus, 'closed'>, number> = { open: 1, slow: 1.6 }

/** A live reading is used for this long; older ones count as saved and the status-based estimate is shown. */
export const LIVE_FRESH_MS = 20 * 60_000

export type TrafficReading = {
  level: TrafficLevel
  ratio: number
  /** Expected commute (the route's usual commute time scaled by the delay), minutes. */
  minLo: number
  minHi: number
  /** 'official' = closed by an advisory; 'live' = Google traffic now; 'estimate' = from route reports only. */
  source: 'official' | 'live' | 'estimate'
  fetchedAt: number | null
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

/** The route's traffic now, from its official state and (when fresh) Google's traffic-aware duration. */
export function trafficFor(c: Corridor, cs: CorridorState, live: LiveRoute | null | undefined, now: number): TrafficReading {
  if (cs.status === 'closed') return { level: 'closed', ratio: Infinity, minLo: cs.minLo, minHi: cs.minHi, source: 'official', fetchedAt: null }
  const floor = STATUS_RATIO[cs.status]
  const fresh = live && now - live.fetchedAt <= LIVE_FRESH_MS && live.staticS > 0 ? live : null
  const liveRatio = fresh ? Math.max(1, fresh.durationS / fresh.staticS) : null
  if (liveRatio != null && liveRatio >= floor) {
    return {
      level: levelFromRatio(liveRatio), ratio: liveRatio,
      minLo: round5(c.usualMin * liveRatio * 0.9), minHi: round5(c.usualMin * liveRatio * 1.1),
      source: 'live', fetchedAt: fresh!.fetchedAt,
    }
  }
  return { level: levelFromRatio(floor), ratio: floor, minLo: cs.minLo, minHi: cs.minHi, source: 'estimate', fetchedAt: null }
}

/** Chance of rain, worded and levelled for text. */
export function rainLevel(pct: number | null): Level {
  if (pct == null) return 'none'
  return pct < 30 ? 'low' : pct < 60 ? 'mid' : 'high'
}

// ── When should I leave? ────────────────────────────────────────────────────

export const DEPARTURE_OFFSETS_MIN = [0, 30, 60, 120] as const

export type Departure = {
  offsetMin: number
  at: number
  rainPct: number | null
  traffic: TrafficReading
  /** The recommended slot: least time on the road, with rain counted as risk and campus waiting discounted.
   *  Never set when the route is closed. */
  best: boolean
}

/** Rain makes the trip riskier (flooding, waiting at a stop, the walk home): counted as extra minutes on the road. */
const rainPenalty = (pct: number | null) => (pct == null ? 0 : pct >= 60 ? 40 : pct >= 30 ? 15 : 0)
/** Waiting on campus is safe but not free: each minute of waiting counts a quarter of a minute on the road. */
const WAIT_WEIGHT = 0.25

/**
 * Departure options for one route: now, in 30 min, 1 h and 2 h. Traffic for later slots comes from Google's
 * forecast for that departure time when available (`forecast[offsetMin]`), otherwise the current reading is
 * carried forward (and marked an estimate). Rain chance comes from the hourly forecast.
 */
export function departureOptions(c: Corridor, cs: CorridorState, now: number, hourly: readonly HourForecast[] | undefined,
  liveNow: LiveRoute | null | undefined, forecast: Partial<Record<number, LiveRoute>> = {}): Departure[] {
  const current = trafficFor(c, cs, liveNow, now)
  const slots = DEPARTURE_OFFSETS_MIN.map((offsetMin): Departure => {
    const at = now + offsetMin * 60_000
    const f = offsetMin === 0 ? null : forecast[offsetMin]
    // A forecast is judged as of its own departure time, so it is never "stale" relative to that slot.
    const traffic = offsetMin === 0 ? current : f ? trafficFor(c, cs, { ...f, fetchedAt: at }, at) : { ...current, source: current.source === 'live' ? 'estimate' as const : current.source }
    return { offsetMin, at, rainPct: hourAt(hourly, at)?.rainPct ?? null, traffic, best: false }
  })
  if (cs.status === 'closed') return slots
  const score = (d: Departure) => d.offsetMin * WAIT_WEIGHT + (d.traffic.minLo + d.traffic.minHi) / 2 + rainPenalty(d.rainPct)
  let best = slots[0]
  for (const d of slots) if (score(d) < score(best)) best = d
  best.best = true
  return slots
}
