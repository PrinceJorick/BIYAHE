// Shared domain types. This module imports nothing, so both src/data.ts and the campus
// registry (src/campuses) can depend on it without depending on each other.
// src/data.ts re-exports the domain types for existing `import type … from '../data'` callers.

export type LatLng = [number, number]

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
  // Straight-line walking estimate from the campus point, in minutes (src/lib/coords.ts). Always shown as an estimate.
  walkMin: number
  // People the spot can hold for a few hours; null = not yet assessed (never guessed). See SPOT_CAPACITY_RULE.
  capacity: number | null
  occupied: number
  amenities: Record<Amenity, boolean>
  pos: LatLng
}

// Lifecycle of a campus advisory. Absent means 'published' (issuer feeds and older records).
export type AdvisoryStatus = 'draft' | 'published' | 'resolved'

export type Advisory = {
  id: string
  source: AdvisorySource
  issuer: string
  title: string
  body: string
  severity: Severity
  // a corridor id, 'campus', or 'all'
  scope: string
  // when it was published (for a draft: when it was created)
  issuedAt: number
  status?: AdvisoryStatus
  // last edit, publication or resolution
  updatedAt?: number
  // no longer current after this time
  expiresAt?: number
  resolvedAt?: number
  // corridor-scoped advisories: the corridor status applied when the advisory is published
  corridorStatus?: CorridorStatus
}

export type Snapshot = {
  corridors: Record<string, CorridorState>
  spots: Spot[]
  advisories: Advisory[]
  updatedAt: number
}

/** One forecast hour (Google Weather). rainPct: chance of rain, 0-100, null when the model gives none. code: WMO-style. */
export type HourForecast = { t: number; rainPct: number | null; code: number; tempC: number }

/** A public weather alert passed on from its issuing authority (PAGASA in the Philippines) by Google Weather. */
export type WeatherAlert = {
  id: string
  title: string
  description: string
  authority: string
  authorityUrl: string | null
  severity: string
  urgency: string
  areaName: string
  instructions: string[]
  startAt: number | null
  expiresAt: number | null
}

export type Weather = {
  tempC: number
  precipMm: number
  windKph: number
  label: string
  /** WMO-style weather code (absent in copies saved by older versions). */
  code?: number
  isDay?: boolean
  /** When the app received this reading. */
  fetchedAt: number
  /** When the provider computed the conditions (absent in older copies). */
  observedAt?: number
  live: boolean
  /** 'google' = Google Weather API; 'demo' = the built-in placeholder; absent in copies saved by older versions. */
  source?: 'google' | 'demo'
  rainPct?: number | null
  thunderPct?: number | null
  feelsLikeC?: number | null
  /** The next hours, from the current hour. Absent in copies saved by older versions. */
  hourly?: HourForecast[]
  /** Public alerts at the campus point; undefined when they could not be checked (never read as "none"). */
  alerts?: WeatherAlert[]
}

// ── Campus registry ────────────────────────────────────────────────────────

export type CampusId = 'alangilan' | 'pablo-borbon' | 'malvar'

// A safe spot's fixed attributes. Occupancy is live snapshot data, so it is not part of the seed.
export type SpotSeed = Omit<Spot, 'occupied'>

export type Campus = {
  id: CampusId
  // Formal name, e.g. 'Batangas State University - Alangilan Campus'
  name: string
  // The name the UI and share messages use, e.g. 'BatStateU Alangilan'
  shortName: string
  // Map centre, weather point and the first point of every corridor path
  location: LatLng
  corridors: Corridor[]
  spots: SpotSeed[]
}
