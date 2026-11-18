// Reconciling stored / remote safe-spot records with the registry, and the IndexedDB v2 migration.
import { describe, expect, it } from 'vitest'
import { alangilan } from '../campuses/alangilan'
import type { Snapshot, Spot } from '../types'
import { DB_VERSION, ROUTES, upgrade } from './idb'
import { canonicalSpotId, migrateSnapshotRecord, reconcileSnapshot, reconcileSpots } from './spotData'

const seeds = alangilan.spots
// What a pre-Iteration-3 install saved: the old lobby record and footprint-derived gym/library points.
const OLD: Spot[] = [
  { id: 'cics', name: 'CICS Lobby', walkMin: 3, capacity: 180, occupied: 40, amenities: { power: true, water: true, food: true }, pos: [13.7849, 121.0745] },
  { id: 'gym', name: 'Gymnasium', walkMin: 6, capacity: 500, occupied: 1200, amenities: { power: true, water: false, food: false }, pos: [13.7838, 121.0727] },
  { id: 'library', name: 'Einstein Bldg Library, 2nd floor', walkMin: 2, capacity: 250, occupied: 63, amenities: { power: false, water: false, food: true }, pos: [13.78412, 121.07481] },
]

describe('reconcileSpots', () => {
  const out = reconcileSpots(seeds, OLD)
  const by = (id: string) => out.find((s) => s.id === id)!

  it('returns one spot per seed, in seed order', () => {
    expect(out.map((s) => s.id)).toEqual(seeds.map((s) => s.id))
  })

  it('takes name, position, capacity and walking estimate from the registry', () => {
    for (const s of out) {
      const seed = seeds.find((x) => x.id === s.id)!
      expect([s.name, s.pos, s.capacity, s.walkMin]).toEqual([seed.name, seed.pos, seed.capacity, seed.walkMin])
    }
    expect(by('lounge').name).toBe('Student Lounge')
    expect(by('gym').pos).toEqual([13.784276340529747, 121.07413074951742])
  })

  it('keeps live occupancy and amenities, carrying the legacy lobby record over to the Student Lounge', () => {
    expect(by('lounge').occupied).toBe(40)
    expect(by('lounge').amenities).toEqual({ power: true, water: true, food: true })
    expect(by('library').amenities).toEqual({ power: false, water: false, food: true })
  })

  it('clamps occupancy to a known capacity', () => {
    expect(by('gym').occupied).toBe(1030)
  })

  it('prefers a current-ID record over a legacy one', () => {
    const both = reconcileSpots(seeds, [...OLD, { ...OLD[0], id: 'lounge', occupied: 7 }])
    expect(both.find((s) => s.id === 'lounge')!.occupied).toBe(7)
  })

  it('fills a missing record from the seed, empty', () => {
    const lounge = reconcileSpots(seeds, []).find((s) => s.id === 'lounge')!
    expect(lounge).toMatchObject({ occupied: 0, amenities: seeds.find((s) => s.id === 'lounge')!.amenities })
  })

  it('survives malformed input', () => {
    expect(reconcileSpots(seeds, undefined)).toHaveLength(seeds.length)
    expect(reconcileSpots(seeds, [null, { id: 3 }, { id: 'gym', occupied: 'x', amenities: null }] as never).find((s) => s.id === 'gym')!.occupied).toBe(0)
  })

  it('never shares nested objects with the registry', () => {
    const s = reconcileSpots(seeds, OLD)[0]
    expect(s.pos).not.toBe(seeds[0].pos)
    expect(s.amenities).not.toBe(seeds[0].amenities)
  })

  it('reconcileSnapshot keeps everything but the spots', () => {
    const snap = { corridors: { lipa: {} }, spots: OLD, advisories: [{ id: 'a' }], updatedAt: 5 } as unknown as Snapshot
    const next = reconcileSnapshot(snap, seeds)
    expect(next.corridors).toBe(snap.corridors)
    expect(next.advisories).toBe(snap.advisories)
    expect(next.updatedAt).toBe(5)
    expect(snap.spots).toBe(OLD)
  })
})

describe('migrateSnapshotRecord (IndexedDB v1 → v2)', () => {
  it('renames the legacy lobby ID and name, keeps everything else', () => {
    const rec = { snapshot: { corridors: {}, spots: OLD, advisories: [], updatedAt: 1 }, savedAt: 2 }
    const out = migrateSnapshotRecord(rec)
    expect(out.savedAt).toBe(2)
    expect(out.snapshot.spots[0]).toMatchObject({ id: 'lounge', name: 'Student Lounge', occupied: 40 })
    expect(out.snapshot.spots[1]).toEqual(OLD[1])
    expect(rec.snapshot.spots[0].id).toBe('cics')
  })

  it('leaves non-snapshot values alone', () => {
    const weather = { tempC: 26 }
    expect(migrateSnapshotRecord(weather)).toBe(weather)
    expect(migrateSnapshotRecord(null)).toBe(null)
  })

  it('maps IDs', () => {
    expect(canonicalSpotId('cics')).toBe('lounge')
    expect(canonicalSpotId('gym')).toBe('gym')
  })
})

// A minimal fake of the IndexedDB upgrade objects: enough to check what upgrade() touches.
function fakeDb(initial: Record<string, unknown>) {
  const kv = new Map(Object.entries(initial))
  const stores = new Set<string>(initial ? ['kv'] : [])
  const db = {
    objectStoreNames: { contains: (n: string) => stores.has(n) },
    createObjectStore: (n: string) => void stores.add(n),
  }
  const tx = {
    objectStore: () => ({
      openCursor() {
        const keys = [...kv.keys()]
        let i = 0
        const req: { result: unknown; onsuccess?: () => void } = { result: null }
        const step = () => {
          const key = keys[i]
          req.result = key === undefined ? null : {
            key, value: kv.get(key),
            update: (v: unknown) => kv.set(key, v),
            continue: () => { i++; step() },
          }
          req.onsuccess?.()
        }
        queueMicrotask(step)
        return req
      },
    }),
  }
  return { db: db as unknown as IDBDatabase, tx: tx as unknown as IDBTransaction, kv, stores }
}

describe('IndexedDB upgrade', () => {
  it('is version 2', () => expect(DB_VERSION).toBe(2))

  it('from v1: migrates every campus snapshot, adds the routes store, keeps weather untouched', async () => {
    const weather = { tempC: 26, label: 'Light rain' }
    const f = fakeDb({
      'snapshot:alangilan': { snapshot: { corridors: {}, spots: OLD, advisories: [], updatedAt: 1 }, savedAt: 2 },
      'snapshot:malvar': { snapshot: { corridors: {}, spots: [], advisories: [], updatedAt: 1 }, savedAt: 3 },
      'weather:alangilan': weather,
    })
    upgrade(f.db, f.tx, 1)
    await new Promise((r) => setTimeout(r))
    expect(f.stores.has(ROUTES)).toBe(true)
    const a = f.kv.get('snapshot:alangilan') as { snapshot: { spots: Spot[] }; savedAt: number }
    expect(a.snapshot.spots.map((s) => s.id)).toEqual(['lounge', 'gym', 'library'])
    expect(a.savedAt).toBe(2)
    expect(f.kv.get('weather:alangilan')).toBe(weather)
    expect(f.kv.size).toBe(3)
  })

  it('fresh install: creates both stores and migrates nothing', () => {
    const stores = new Set<string>()
    const db = { objectStoreNames: { contains: (n: string) => stores.has(n) }, createObjectStore: (n: string) => void stores.add(n) } as unknown as IDBDatabase
    upgrade(db, {} as IDBTransaction, 0)
    expect([...stores]).toEqual(['kv', ROUTES])
  })
})
