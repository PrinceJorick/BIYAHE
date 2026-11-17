// Campus reference data access and the simulated fixtures used when Supabase is unconfigured or unreachable.

import type {
  Advisory, Corridor, CorridorState, CorridorStatus, LatLng, Severity, Snapshot, Spot, Weather,
} from './types'
import { DEFAULT_CAMPUS } from './campuses'

// The domain types live in ./types; re-exported so existing `import type … from '../data'` keeps working.
export type {
  Advisory, AdvisorySource, Amenity, Corridor, CorridorState, CorridorStatus, LatLng, Provenance, Severity, Snapshot, Spot, Weather,
} from './types'

// Compatibility aliases for the default campus (Alangilan). The data itself lives in src/campuses.
export const CAMPUS: LatLng = DEFAULT_CAMPUS.location

export const corridors: Corridor[] = DEFAULT_CAMPUS.corridors

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

// Snapshot spots from the campus seeds (cics, gym, library), with occupancy assigned by position.
// Nested amenities/pos are copied so a snapshot never shares objects with the registry, and the
// key order matches the spot literals this replaced.
const baseSpots = (occupied: [number, number, number]): Spot[] =>
  DEFAULT_CAMPUS.spots.map((s, i) => ({
    id: s.id, name: s.name, walkMin: s.walkMin, capacity: s.capacity, occupied: occupied[i],
    amenities: { ...s.amenities }, pos: [s.pos[0], s.pos[1]],
  }))

export function fixture(kind: 'clear' | 'disrupted', now = Date.now()): Snapshot {
  const states: Record<string, CorridorState> = {}
  for (const c of corridors) states[c.id] = corridorStateFor(c, 'open')
  if (kind === 'clear') {
    return { corridors: states, spots: baseSpots([10, 30, 40]), advisories: [], updatedAt: now - 2 * MIN }
  }
  states.lipa = { ...corridorStateFor(corridors[0], 'closed', 'Flooding on JP Laurel Hwy near Balagtas. Classes suspended from 3:30 PM.', 'PAGASA + 3 LGU road reports'), minLo: 135, minHi: 190 }
  states.bauan = corridorStateFor(corridors[2], 'slow', 'Heavy traffic and ponding on Diversion Rd.')
  const advisories: Advisory[] = [
    fromLgu({ office: 'Batangas City DRRMO', kind: 'flood', road: 'JP Laurel Hwy', barangays: ['Balagtas', 'Alangilan'], passable: 'none', corridorId: 'lipa',
      headline: 'Flooding on JP Laurel Hwy near Balagtas', text: 'Knee-deep water near Balagtas. Not passable to jeepneys and light vehicles. Avoid the area.', issuedAt: now - 8 * MIN }, 'jpl-flood'),
    fromPagasa({ bulletinNo: 'RA-07', kind: 'rainfall', level: 'orange', area: 'Batangas',
      headline: 'Orange rainfall warning, Batangas', text: 'Intense rain (15–30 mm/h) expected over the next 3 hours. Flooding is threatening in low-lying areas.', issuedAt: now - 25 * MIN }),
    { id: 'campus-suspend', source: 'Campus', issuer: 'Campus DRRMO', title: 'Classes suspended from 3:30 PM',
      body: 'All afternoon and evening classes at Alangilan are suspended. Safe spots are open in CICS Lobby and the Gymnasium.', severity: 'warning', scope: 'campus', issuedAt: now - 40 * MIN },
  ]
  return { corridors: states, spots: baseSpots([60, 200, 150]), advisories, updatedAt: now - 1 * MIN }
}

export const fallbackWeather = (now = Date.now()): Weather => ({ tempC: 26, precipMm: 1.2, windKph: 14, label: 'Light rain', fetchedAt: now, live: false })
