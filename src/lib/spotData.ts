// Safe-spot reference data vs live data, and migration of records written by older versions.
//
// A safe spot has two kinds of fields:
//   fixed  — id, name, position, capacity, walking estimate: owned by the campus registry (src/campuses)
//   live   — occupancy and amenities: changed by coordinators, synced through IndexedDB, tabs and Supabase
// Whatever a snapshot came from (an old IndexedDB copy, an old browser tab, a Supabase row written before a
// rename or a coordinate correction), reconcileSpots() keeps only its live fields and takes every fixed field
// from the registry. Old names and old coordinates therefore can never be shown as current.
import type { Snapshot, Spot, SpotSeed } from '../types'

/**
 * Safe-spot IDs used by earlier versions, mapped to the current ID. 'cics' is the pre-Iteration-3 record of the
 * place now called Student Lounge; its occupancy and amenities carry over to 'lounge'.
 */
export const LEGACY_SPOT_IDS: Readonly<Record<string, string>> = Object.freeze({ cics: 'lounge' })

/** Display names used by earlier versions, mapped to the current name (migration only; never displayed). */
export const LEGACY_SPOT_NAMES: Readonly<Record<string, string>> = Object.freeze({ 'CICS Lobby': 'Student Lounge' })

export const canonicalSpotId = (id: string) => LEGACY_SPOT_IDS[id] ?? id

const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0)
const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

/**
 * One Spot per registry seed, in seed order. Live fields come from `live` (matched by ID, legacy IDs included;
 * a current-ID record wins over a legacy one); a seed with no live record starts empty with its seed amenities.
 * Occupancy is clamped to the capacity when the capacity is known.
 */
export function reconcileSpots(seeds: readonly SpotSeed[], live: readonly Partial<Spot>[] | undefined): Spot[] {
  const byId = new Map<string, Partial<Spot>>()
  const records = Array.isArray(live) ? live.filter((x) => x && typeof x.id === 'string') : []
  for (const x of records) if (x.id! in LEGACY_SPOT_IDS && !byId.has(canonicalSpotId(x.id!))) byId.set(canonicalSpotId(x.id!), x)
  for (const x of records) if (!(x.id! in LEGACY_SPOT_IDS)) byId.set(x.id!, x)
  return seeds.map((seed) => {
    const l = byId.get(seed.id)
    const occupied = l ? Math.min(seed.capacity ?? Infinity, count(l.occupied)) : 0
    const a = l?.amenities
    return {
      id: seed.id, name: seed.name, walkMin: seed.walkMin, capacity: seed.capacity, occupied,
      amenities: { power: flag(a?.power, seed.amenities.power), water: flag(a?.water, seed.amenities.water), food: flag(a?.food, seed.amenities.food) },
      pos: [seed.pos[0], seed.pos[1]],
    }
  })
}

/** The same snapshot with its spots reconciled against the registry. Never mutates the input. */
export const reconcileSnapshot = (snapshot: Snapshot, seeds: readonly SpotSeed[]): Snapshot => ({ ...snapshot, spots: reconcileSpots(seeds, snapshot.spots) })

/**
 * IndexedDB v1 → v2: renames legacy spot IDs and names inside a stored `{ snapshot, savedAt }` record. Registry-
 * independent (it runs inside the database upgrade, for every campus's key); positions are corrected later by
 * reconcileSpots() when the campus loads. Returns the input unchanged when it is not a snapshot record.
 */
export function migrateSnapshotRecord<T>(record: T): T {
  const r = record as { snapshot?: { spots?: unknown } } | null
  const spots = r?.snapshot?.spots
  if (!Array.isArray(spots)) return record
  const renamed = spots.map((x: Partial<Spot>) => (x && typeof x === 'object'
    ? { ...x, ...(typeof x.id === 'string' ? { id: canonicalSpotId(x.id) } : {}), ...(typeof x.name === 'string' && x.name in LEGACY_SPOT_NAMES ? { name: LEGACY_SPOT_NAMES[x.name] } : {}) }
    : x))
  return { ...r, snapshot: { ...r!.snapshot, spots: renamed } } as T
}
