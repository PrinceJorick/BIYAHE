// Domain types and the simulated fixtures used when Supabase is unconfigured or unreachable.

export type LatLng = [number, number]

// BatStateU Alangilan, Batangas City
export const CAMPUS: LatLng = [13.7842, 121.0744]

export type CorridorStatus = 'open' | 'slow' | 'closed'
export type Provenance = 'official' | 'estimate' | 'saved'
export type Amenity = 'power' | 'water' | 'food'
export type AdvisorySource = 'PAGASA' | 'LGU' | 'Campus'
export type Severity = 'info' | 'warning' | 'critical'

export type Corridor = {
  id: string
  name: string
  via: string
  usualMin: number
  // Students who picked this corridor. An aggregate count only, never a list of people (RA 10173).
  commuters: number
  path: LatLng[]
}

export type CorridorState = {
  status: CorridorStatus
  minLo: number
  minHi: number
  note: string
  source: string
  provenance: Exclude<Provenance, 'saved'>
}

export type Spot = {
  id: string
  name: string
  walkMin: number
  capacity: number
  occupied: number
  amenities: Record<Amenity, boolean>
  pos: LatLng
}

export type Advisory = {
  id: string
  source: AdvisorySource
  issuer: string
  title: string
  body: string
  severity: Severity
  // a corridor id, 'campus', or 'all'
  scope: string
  issuedAt: number
}

export type Snapshot = {
  corridors: Record<string, CorridorState>
  spots: Spot[]
  advisories: Advisory[]
  updatedAt: number
}

export type Weather = {
  tempC: number
  precipMm: number
  windKph: number
  label: string
  fetchedAt: number
  live: boolean
}

export const corridors: Corridor[] = [
  { id: 'lipa', name: 'Lipa City', via: 'JP Laurel Hwy', usualMin: 50, commuters: 140,
    path: [CAMPUS, [13.7875, 121.0705], [13.7935, 121.0655], [13.8, 121.064], [13.81, 121.07]] },
  { id: 'batangas', name: 'Batangas City proper', via: 'P. Burgos', usualMin: 20, commuters: 210,
    path: [CAMPUS, [13.778, 121.069], [13.77, 121.064], [13.7575, 121.058]] },
  { id: 'bauan', name: 'Bauan / San Pascual', via: 'Diversion Rd', usualMin: 35, commuters: 60,
    path: [CAMPUS, [13.783, 121.062], [13.786, 121.045], [13.79, 121.02]] },
  { id: 'sanjose', name: 'San Jose / Ibaan', via: 'Batangas–Lipa Rd', usualMin: 30, commuters: 85,
    path: [CAMPUS, [13.792, 121.085], [13.805, 121.1], [13.82, 121.115]] },
  { id: 'tanauan', name: 'Tanauan / Sto. Tomas', via: 'STAR Tollway', usualMin: 65, commuters: 45,
    path: [CAMPUS, [13.795, 121.078], [13.82, 121.085], [13.85, 121.095]] },
]

export const corridorById = (id: string | null) => corridors.find((c) => c.id === id) ?? corridors[0]

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5)

// Travel-time band for a corridor at a given status. Open follows the usual time;
// slow and closed are hazard-adjusted estimates.
export function corridorStateFor(c: Corridor, status: CorridorStatus, note = '', source?: string): CorridorState {
  if (status === 'open') {
    return { status, minLo: round5(c.usualMin * 0.9), minHi: round5(c.usualMin * 1.1), note: note || 'No hazards reported on your corridor.',
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

const baseSpots = (occupied: [number, number, number]): Spot[] => [
  { id: 'cics', name: 'CICS Lobby', walkMin: 3, capacity: 180, occupied: occupied[0],
    amenities: { power: true, water: true, food: true }, pos: [13.7849, 121.0745] },
  { id: 'gym', name: 'Gymnasium', walkMin: 6, capacity: 500, occupied: occupied[1],
    amenities: { power: true, water: true, food: false }, pos: [13.7838, 121.0727] },
  { id: 'library', name: 'Library', walkMin: 4, capacity: 150, occupied: occupied[2],
    amenities: { power: true, water: false, food: false }, pos: [13.7832, 121.0752] },
]

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
