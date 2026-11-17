import { DEFAULT_CAMPUS } from '../campuses'
import { corridorById, type Advisory, type Amenity, type Corridor, type CorridorState, type Provenance, type Spot } from '../data'
import { isOffline, type State } from './store'

const MIN = 60_000
export const STALE_AFTER_MIN = 30

export function fmtMin(m: number) {
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}h ${r}m` : `${h}h`
}

export const fmtRange = (lo: number, hi: number) => (lo === hi ? fmtMin(lo) : `${hi < 60 ? lo : fmtMin(lo)}–${fmtMin(hi)}`)

export const clock = (t: number) => new Date(t).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })

export function ago(t: number, now: number) {
  const m = Math.max(0, Math.round((now - t) / MIN))
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  return `${fmtMin(m)} ago`
}

export const amenityLabel: Record<Amenity, string> = { power: 'Power', water: 'Water', food: 'Food' }

export const spacesLeft = (s: Spot) => s.capacity - s.occupied

// Nearest spot that still has room.
export const bestSpot = (spots: Spot[]) =>
  [...spots].filter((s) => spacesLeft(s) > 0).sort((a, b) => a.walkMin - b.walkMin)[0] as Spot | undefined

export type StudentView = {
  corridor: Corridor
  cs: CorridorState
  decision: 'go' | 'wait'
  // 'saved' whenever what is on screen is not a current reading
  provenance: Provenance
  offline: boolean
  stale: boolean
  ageMin: number
  spot: Spot | undefined
}

export function studentView(s: State, now: number): StudentView {
  const corridor = corridorById(s.corridorId)
  const cs = s.snapshot.corridors[corridor.id]
  const ageMin = Math.max(0, Math.round((now - s.snapshot.updatedAt) / MIN))
  const offline = isOffline(s)
  const stale = ageMin > STALE_AFTER_MIN
  const chosen = s.snapshot.spots.find((x) => x.id === s.spotId && spacesLeft(x) > 0)
  return {
    corridor, cs, offline, stale, ageMin,
    decision: cs.status === 'closed' ? 'wait' : 'go',
    provenance: offline || stale ? 'saved' : cs.provenance,
    spot: chosen ?? bestSpot(s.snapshot.spots),
  }
}

export const concernsStudent = (a: Advisory, corridorId: string | null) => a.scope === 'all' || a.scope === 'campus' || a.scope === corridorId

export function shareMessage(v: StudentView, mode: 'campus' | 'home') {
  const { corridor, cs, spot } = v
  if (mode === 'home') {
    return `I'm heading home from ${DEFAULT_CAMPUS.shortName} via ${corridor.via}. Travel time looks like ${fmtRange(cs.minLo, cs.minHi)}. I'll message you when I arrive.`
  }
  const why = cs.status === 'closed' ? `${corridor.via} is closed right now` : cs.status === 'slow' ? `${corridor.via} is slow right now` : 'I am staying on campus for now'
  const where = spot
    ? `, so I'm waiting at ${spot.name}${amenityList(spot) ? ` (${amenityList(spot)})` : ''}`
    : ', so I am waiting on campus'
  return `I'm safe at ${DEFAULT_CAMPUS.shortName}. ${why}${where}. I'll head home when the road clears.`
}

export const amenityList = (s: Spot) =>
  (Object.keys(amenityLabel) as Amenity[]).filter((a) => s.amenities[a]).map((a) => amenityLabel[a].toLowerCase()).join(', ')
