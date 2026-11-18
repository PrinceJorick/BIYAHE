// Campus reference data access and the simulated fixtures used when Supabase is unconfigured or unreachable.

import type {
  Advisory, Corridor, CorridorState, CorridorStatus, LatLng, Severity, Snapshot, Spot, Weather,
} from './types'
import { ACTIVE_CAMPUS, campusKeyPrefix } from './campuses/active'

// The domain types live in ./types; re-exported so existing `import type … from '../data'` keeps working.
export type {
  Advisory, AdvisorySource, Amenity, Corridor, CorridorState, CorridorStatus, LatLng, Provenance, Severity, Snapshot, Spot, Weather,
} from './types'

// The campus this device uses (src/campuses/active.ts). The data itself lives in src/campuses.
export const CAMPUS: LatLng = ACTIVE_CAMPUS.location

export const corridors: Corridor[] = ACTIVE_CAMPUS.corridors

export const spotSeeds = ACTIVE_CAMPUS.spots

// Advisory IDs are prefixed for campuses other than the default, so campuses can share one backend.
export const advisoryId = (id: string) => `${campusKeyPrefix(ACTIVE_CAMPUS.id)}${id}`
export const isCampusAdvisoryId = (id: string) => {
  const prefix = campusKeyPrefix(ACTIVE_CAMPUS.id)
  return prefix ? id.startsWith(prefix) : !id.includes(':')
}

export const corridorById = (id: string | null) => corridors.find((c) => c.id === id) ?? corridors[0]

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

// Travel-time band for a corridor at a given status. Open follows the usual time;
// slow and closed are hazard-adjusted estimates.
export function corridorStateFor(c: Corridor, status: CorridorStatus, note = '', source?: string): CorridorState {
  if (status === 'open') {
    return { status, minLo: round5(c.usualMin * 0.9), minHi: round5(c.usualMin * 1.1), note: note || 'No hazards reported on your route.',
      source: source ?? 'PAGASA, Batangas City DRRMO', provenance: 'official' }
  }
  if (status === 'slow') {
    return { status, minLo: round5(c.usualMin * 1.4), minHi: round5(c.usualMin * 1.85), note: note || `Heavy traffic and ponding on ${c.via}.`,
      source: source ?? 'LGU road reports', provenance: 'estimate' }
  }
  return { status, minLo: round5(c.usualMin * 2.7), minHi: round5(c.usualMin * 3.8), note: note || `${c.via} is not passable right now.`,
    source: source ?? 'PAGASA + LGU road reports', provenance: 'estimate' }
}

// ── Structured source schemas ──────────────────────────────────────────────
// Shapes we ingest from each issuer, normalised into Advisory for display.

export type PagasaAdvisory = {
  bulletinNo: string
  kind: 'rainfall' | 'thunderstorm' | 'tropical-cyclone' | 'flood'
  level: 'yellow' | 'orange' | 'red' | 'tcws-1' | 'tcws-2' | 'tcws-3' | 'none'
  area: string
  headline: string
  text: string
  issuedAt: number
  validUntil?: number
}

export type LguAdvisory = {
  office: 'Batangas City DRRMO' | 'Batangas City Mayor’s Office' | 'Batangas PDRRMO'
  kind: 'flood' | 'road-closure' | 'class-suspension' | 'evacuation'
  road?: string
  barangays: string[]
  passable: 'all' | 'heavy-vehicles-only' | 'none'
  corridorId?: string
  headline: string
  text: string
  issuedAt: number
}

const pagasaSeverity: Record<PagasaAdvisory['level'], Severity> = {
  none: 'info', yellow: 'info', orange: 'warning', red: 'critical', 'tcws-1': 'warning', 'tcws-2': 'critical', 'tcws-3': 'critical',
}

export const fromPagasa = (a: PagasaAdvisory): Advisory => ({
  id: `pagasa-${a.bulletinNo}`, source: 'PAGASA', issuer: 'PAGASA', title: a.headline, body: a.text,
  severity: pagasaSeverity[a.level], scope: 'all', issuedAt: a.issuedAt,
})

export const fromLgu = (a: LguAdvisory, id: string): Advisory => ({
  id: `lgu-${id}`, source: 'LGU', issuer: a.office, title: a.headline, body: a.text,
  severity: a.passable === 'none' ? 'critical' : a.passable === 'heavy-vehicles-only' ? 'warning' : 'info',
  scope: a.corridorId ?? 'all', issuedAt: a.issuedAt,
})

// ── Fixtures ───────────────────────────────────────────────────────────────

const MIN = 60_000

// Snapshot spots from the campus seeds, with occupancy as a share of each spot's capacity (by position,
// repeating). A spot whose capacity is not assessed starts empty. Nested amenities/pos are copied so a snapshot
// never shares objects with the registry.
const baseSpots = (share: number[]): Spot[] =>
  spotSeeds.map((s, i) => ({
    id: s.id, name: s.name, walkMin: s.walkMin, capacity: s.capacity,
    occupied: s.capacity == null ? 0 : Math.round(s.capacity * share[i % share.length]),
    amenities: { ...s.amenities }, pos: [s.pos[0], s.pos[1]],
  }))

const spotNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

// Demo scenarios. Disrupted: the first route is closed by flooding, the third (or second) is slow.
export function fixture(kind: 'clear' | 'disrupted', now = Date.now()): Snapshot {
  const states: Record<string, CorridorState> = {}
  for (const c of corridors) states[c.id] = corridorStateFor(c, 'open')
  if (kind === 'clear') {
    return { corridors: states, spots: baseSpots([0.05, 0.25]), advisories: [], updatedAt: now - 2 * MIN }
  }
  const closed = corridors[0]
  const slow = corridors[2] ?? corridors[1]
  const flood = ACTIVE_CAMPUS.id === 'alangilan'
    ? { headline: 'Flooding on JP Laurel Hwy near Balagtas', note: 'Flooding on JP Laurel Hwy near Balagtas. Classes suspended from 3:30 PM.', barangays: ['Balagtas', 'Alangilan'],
      text: 'Knee-deep water near Balagtas. Not passable to jeepneys and light vehicles. Avoid the area.' }
    : { headline: `Flooding on ${closed.via}`, note: `Flooding on ${closed.via}. Classes suspended from 3:30 PM.`, barangays: [],
      text: `Knee-deep water on ${closed.via} towards ${closed.name}. Not passable to jeepneys and light vehicles. Avoid the area.` }
  states[closed.id] = corridorStateFor(closed, 'closed', flood.note, 'PAGASA + 3 LGU road reports')
  if (slow && slow !== closed) states[slow.id] = corridorStateFor(slow, 'slow', `Heavy traffic and ponding on ${slow.via}.`)
  const open = spotNames(spotSeeds.map((s) => s.name))
  const advisories = ([
    fromLgu({ office: ACTIVE_CAMPUS.id === 'malvar' ? 'Batangas PDRRMO' : 'Batangas City DRRMO', kind: 'flood', road: closed.via, barangays: flood.barangays, passable: 'none', corridorId: closed.id,
      headline: flood.headline, text: flood.text, issuedAt: now - 8 * MIN }, 'jpl-flood'),
    fromPagasa({ bulletinNo: 'RA-07', kind: 'rainfall', level: 'orange', area: 'Batangas',
      headline: 'Orange rainfall warning, Batangas', text: 'Intense rain (15–30 mm/h) expected over the next 3 hours. Flooding is threatening in low-lying areas.', issuedAt: now - 25 * MIN }),
    { id: 'campus-suspend', source: 'Campus', issuer: 'Campus DRRMO', title: 'Classes suspended from 3:30 PM',
      body: `All afternoon and evening classes at ${ACTIVE_CAMPUS.shortName} are suspended.${open ? ` Safe spots are open in ${open}.` : ''}`, severity: 'warning', scope: 'campus', issuedAt: now - 40 * MIN },
  ] satisfies Advisory[]).map((a): Advisory => ({ ...a, id: advisoryId(a.id) }))
  return { corridors: states, spots: baseSpots([0.35, 1]), advisories, updatedAt: now - 1 * MIN }
}

export const fallbackWeather = (now = Date.now()): Weather => ({ tempC: 26, precipMm: 1.2, windKph: 14, label: 'Light rain', fetchedAt: now, live: false })
