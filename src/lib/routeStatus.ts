// One rule for what a route's status means, used by every screen (student and staff), the map and the
// recommendations. Pure, so the three cases below are tested for every campus (routeStatus.test.ts).
//
//   flooded or closed            → closed   "Route is flooded. Do not proceed through this route."
//   open, no other hazard        → open     "Route is clear. You may proceed home."   (shown as "Clear")
//   no report, or data too old   → unknown  "Unable to confirm route conditions. Verify the latest available advisory."
//
// A closed route stays closed when the data is old: an old "closed" is still a reason not to go, while an old
// "clear" is not a reason to go. "slow" (ponding, heavy traffic) is a hazard short of closure.
import type { Corridor, CorridorState, CorridorStatus, Snapshot } from '../types'

export type RouteStatus = CorridorStatus | 'unknown'
/** A route's state as shown: the stored state, with status 'unknown' when it cannot be confirmed. */
export type RouteState = Omit<CorridorState, 'status'> & { status: RouteStatus }

/** Route data older than this is no longer a confirmation that a route is clear. */
export const STALE_AFTER_MIN = 30

export const routeWord: Record<RouteStatus, string> = { open: 'Clear', slow: 'Slow', closed: 'Closed', unknown: 'Unknown' }
export const routeLevel: Record<RouteStatus, 'low' | 'mid' | 'high' | 'none'> = { open: 'low', slow: 'mid', closed: 'high', unknown: 'none' }

export const isStale = (snapshot: Pick<Snapshot, 'updatedAt'>, now: number) => now - snapshot.updatedAt > STALE_AFTER_MIN * 60_000

/** The status to show for one route. `cs` undefined = no report for this route. */
export function routeStatus(cs: CorridorState | undefined, stale: boolean): RouteStatus {
  if (!cs || !['open', 'slow', 'closed'].includes(cs.status)) return 'unknown'
  if (cs.status === 'closed') return 'closed'
  return stale ? 'unknown' : cs.status
}

const UNKNOWN_NOTE = 'No current report for this route.'
const STALE_NOTE = `Last report is over ${STALE_AFTER_MIN} min old.`

/** The state to show for one route (see routeStatus). Never undefined. An unknown route never keeps an old note
 * such as "No hazards reported", which would read as clear. */
export function routeState(c: Corridor, cs: CorridorState | undefined, stale: boolean): RouteState {
  const status = routeStatus(cs, stale)
  if (cs) return { ...cs, status, ...(status === 'unknown' ? { note: stale ? STALE_NOTE : UNKNOWN_NOTE } : {}) }
  return { status, minLo: c.usualMin, minHi: c.usualMin, note: UNKNOWN_NOTE, source: 'No report', provenance: 'estimate' }
}

/** Every route's shown state, from one snapshot. */
export function routeStates(snapshot: Snapshot, corridors: readonly Corridor[], now: number): Record<string, RouteState> {
  const stale = isStale(snapshot, now)
  return Object.fromEntries(corridors.map((c) => [c.id, routeState(c, snapshot.corridors[c.id], stale)]))
}

/** The instruction a student reads for a route, in one sentence pair. */
export function routeMessage(s: Pick<RouteState, 'status' | 'hazard'>): string {
  switch (s.status) {
    case 'closed': return s.hazard === 'flood' ? 'Route is flooded. Do not proceed through this route.' : 'Route is closed. Do not proceed through this route.'
    case 'slow': return 'Route is open but slow. Allow extra time.'
    case 'unknown': return 'Unable to confirm route conditions. Verify the latest available advisory.'
    default: return 'Route is clear. You may proceed home.'
  }
}
