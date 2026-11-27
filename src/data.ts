// Campus reference data access and the simulated fixtures used when Supabase is unconfigured or unreachable.

import type {
  Advisory, Campus, CampusId, Corridor, CorridorState, CorridorStatus, Hazard, LatLng, Severity, Snapshot, Spot, SpotSeed, Weather,
} from './types'
import { hazardStatus } from './lib/hazards'
import type { NewsItem } from './lib/news'
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
const baseSpots = (share: number[], seeds: readonly SpotSeed[] = spotSeeds): Spot[] =>
  seeds.map((s, i) => ({
    id: s.id, name: s.name, walkMin: s.walkMin, capacity: s.capacity,
    occupied: s.capacity == null ? 0 : Math.round(s.capacity * share[i % share.length]),
    amenities: { ...s.amenities }, pos: [s.pos[0], s.pos[1]],
  }))

const spotNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

// Simulated hazards for the "Flooding" demo: several flood sites per campus, placed so that every route passes at
// least one (every route closed, so every student is told to stay on campus). Each point lies on
// the road it names (OpenStreetMap, reverse-geocoded 2026-11-28); which routes it affects is worked out from the
// route geometry (src/lib/hazards.ts), never hand-picked, so the map, statuses and advisories always agree.
export const DEMO_HAZARDS: Record<CampusId, Hazard[]> = {
  alangilan: [
    { id: 'flood', kind: 'flood', pos: [13.90501, 121.10447], road: 'JP Laurel Hwy', place: 'Mojon-Tampoy, San Jose', radiusM: 80 },
    { id: 'flood-2', kind: 'flood', pos: [13.80452, 121.04823], road: 'Diversion Rd', place: 'Banaba Kanluran', radiusM: 80 },
    { id: 'flood-3', kind: 'flood', pos: [13.77421, 121.06621], road: 'National Hwy', place: 'Banaba Ibaba', radiusM: 80 },
    { id: 'flood-4', kind: 'flood', pos: [13.84119, 121.08694], road: 'JP Laurel Hwy', place: 'Bukal', radiusM: 80 },
    { id: 'flood-5', kind: 'flood', pos: [13.81831, 121.13022], road: 'Batangas–Ibaan Rd', place: 'Quilo, Ibaan', radiusM: 80 },
  ],
  'pablo-borbon': [
    { id: 'flood', kind: 'flood', pos: [13.91881, 121.10572], road: 'JP Laurel Hwy', place: 'Mojon-Tampoy, San Jose', radiusM: 80 },
    { id: 'flood-2', kind: 'flood', pos: [13.77714, 121.04265], road: 'Bauan–Batangas Rd', place: 'Santa Rita Aplaya', radiusM: 80 },
    { id: 'flood-3', kind: 'flood', pos: [13.8298, 121.08037], road: 'JP Laurel Hwy', place: 'Banaba Silangan', radiusM: 80 },
    { id: 'flood-4', kind: 'flood', pos: [13.8077, 121.11741], road: 'Batangas–Ibaan Rd', place: 'Quilo, Ibaan', radiusM: 80 },
    { id: 'flood-5', kind: 'flood', pos: [13.81038, 120.99571], road: 'Bauan–Batangas Rd', place: 'Inicbulan, Bauan', radiusM: 80 },
  ],
  malvar: [
    { id: 'flood', kind: 'flood', pos: [14.00926, 121.16535], road: 'JP Laurel Hwy', place: 'Pusil, Malvar', radiusM: 80 },
    { id: 'flood-2', kind: 'flood', pos: [14.07141, 121.15199], road: 'JP Laurel Hwy', place: 'Hidalgo, Tanauan', radiusM: 80 },
    { id: 'flood-3', kind: 'flood', pos: [14.06118, 121.13766], road: 'STAR Tollway', place: 'Banjo Laurel, Tanauan', radiusM: 80 },
    { id: 'flood-4', kind: 'flood', pos: [14.03991, 121.12206], road: 'Balete–Malvar Rd', place: 'San Isidro East, Malvar', radiusM: 80 },
  ],
}

export const hazardNote = (h: Hazard) => h.kind === 'flood' ? `Flooding on ${h.road} at ${h.place}.` : `Ponding and heavy traffic on ${h.road} at ${h.place}.`

/** Route states from hazards: flooded routes closed, ponded routes slow, every other route clear. */
export function statesFromHazards(list: readonly Corridor[], hazards: readonly Hazard[]): Record<string, CorridorState> {
  const by = hazardStatus(list, hazards)
  return Object.fromEntries(list.map((c) => {
    const { status, hazard } = by[c.id]
    if (!hazard) return [c.id, corridorStateFor(c, 'open')]
    return [c.id, { ...corridorStateFor(c, status, hazardNote(hazard), 'LGU road reports'), hazard: hazard.kind }]
  }))
}

// Demo scenarios. Clear: no hazards. Disrupted: the campus's DEMO_HAZARDS, with one LGU advisory per flooded route.
// Every advisory here is marked simulated so it is never mistaken for a real bulletin.
export function fixture(kind: 'clear' | 'disrupted', now = Date.now(), campus: Campus = ACTIVE_CAMPUS): Snapshot {
  const hazards = kind === 'clear' ? [] : DEMO_HAZARDS[campus.id]
  const states = statesFromHazards(campus.corridors, hazards)
  if (kind === 'clear') {
    return { corridors: states, spots: baseSpots([0.05, 0.25], campus.spots), advisories: [], updatedAt: now - 2 * MIN }
  }
  const office = campus.id === 'malvar' ? 'Batangas PDRRMO' as const : 'Batangas City DRRMO' as const
  const by = hazardStatus(campus.corridors, hazards)
  const open = spotNames(campus.spots.map((s) => s.name))
  // One advisory per disrupted route (its own route, so it can be edited or resolved on its own), carrying the status
  // it applies: resolving it with "mark clear" turns that route Clear for its students.
  const routeAdvisories = campus.corridors.filter((c) => by[c.id].hazard).map((c): Advisory => {
    const h = by[c.id].hazard!
    const flooded = h.kind === 'flood'
    return {
      ...fromLgu({ office, kind: flooded ? 'flood' : 'road-closure', road: h.road, barangays: [h.place], passable: flooded ? 'none' : 'heavy-vehicles-only', corridorId: c.id,
        headline: flooded ? `Flooding on ${h.road} at ${h.place}` : `Ponding on ${h.road} at ${h.place}`,
        text: flooded ? `Knee-deep water. Not passable to jeepneys and light vehicles. ${c.name} commuters: wait on campus.`
          : `Slow traffic through standing water. ${c.name} commuters: allow extra time.`,
        issuedAt: now - (flooded ? 8 : 12) * MIN }, `${h.kind}-${c.id}`),
      corridorStatus: flooded ? 'closed' : 'slow',
    }
  })
  const advisories = ([
    ...routeAdvisories,
    fromPagasa({ bulletinNo: 'RA-07', kind: 'rainfall', level: 'orange', area: 'Batangas',
      headline: 'Orange rainfall warning, Batangas', text: 'Intense rain (15–30 mm/h) in the next 3 hours. Flooding likely in low-lying areas.', issuedAt: now - 25 * MIN }),
    { id: 'campus-suspend', source: 'Campus', issuer: 'Campus DRRMO', title: 'Classes suspended from 3:30 PM',
      body: `All afternoon and evening classes at ${campus.shortName} are suspended.${open ? ` Safe spots open: ${open}.` : ''}`, severity: 'warning', scope: 'campus', issuedAt: now - 40 * MIN },
  ] satisfies Advisory[]).map((a): Advisory => ({ ...a, id: `${campusKeyPrefix(campus.id)}${a.id}`, simulated: true }))
  return { corridors: states, spots: baseSpots([0.35, 1], campus.spots), advisories, updatedAt: now - 1 * MIN }
}

/**
 * Sample local-news rows for the staff news monitor when no live report is available, matching the demo scenario
 * (the same hazards as the route statuses). Written by BIYAHE, not a publisher's article: no link, and always shown
 * as Simulated.
 */
export function sampleNews(kind: 'clear' | 'disrupted', now = Date.now(), campus: Campus = ACTIVE_CAMPUS): NewsItem[] {
  const item = (id: string, title: string, summary: string, topics: NewsItem['topics'], minAgo: number): NewsItem =>
    ({ id: `sample-${campus.id}-${id}`, title, summary, source: 'BIYAHE sample', sourceDomain: '', url: '', publishedAt: now - minAgo * MIN, places: [], topics, sample: true })
  if (kind === 'clear') {
    return [
      item('roads', 'Roads clear across Batangas after morning showers', 'Traffic moving normally on the main routes out of the city.', ['road'], 35),
      item('rain', 'Light rain possible tonight over Batangas', 'Scattered showers expected after 8 PM; no warning issued.', ['rain'], 90),
    ]
  }
  const [flood, flood2] = DEMO_HAZARDS[campus.id]
  return [
    item('flood', `Knee-deep flood on ${flood.road} at ${flood.place}`, 'Motorists report the road is impassable to jeepneys and light vehicles.', ['flood', 'road'], 12),
    item('flood-2', `Flooding closes ${flood2.road} at ${flood2.place}`, 'Road impassable; commuters asked to stay put.', ['flood', 'road'], 20),
    item('pagasa', 'PAGASA raises orange rainfall warning over Batangas', 'Intense rain expected in the next three hours.', ['rain'], 30),
    item('classes', `${campus.shortName} suspends afternoon classes`, 'Students are asked to wait at campus safe spots.', ['classes'], 45),
  ]
}

export const fallbackWeather = (now = Date.now()): Weather => ({ tempC: 26, precipMm: 1.2, windKph: 14, label: 'Light rain', fetchedAt: now, live: false, source: 'demo' })
