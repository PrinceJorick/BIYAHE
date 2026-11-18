// Stage 1: campus registry tests. The first block pins the Alangilan reference data exactly
// as it existed before the registry was introduced; it must keep passing unchanged.
import { describe, expect, it } from 'vitest'
import { CAMPUS, corridorById, corridors, fallbackWeather, fixture } from '../data'
import { studentView } from '../lib/derive'
import type { State } from '../lib/store'
import { alangilan } from './alangilan'
import { campuses, DEFAULT_CAMPUS, DEFAULT_CAMPUS_ID, getCampus } from './index'
import { malvar } from './malvar'
import { pabloBorbon } from './pabloBorbon'

const NOW = Date.UTC(2026, 10, 16, 7, 0)

describe('Alangilan reference data (pinned before the registry move)', () => {
  it('campus location', () => {
    expect(CAMPUS).toEqual([13.7842, 121.0744])
  })

  it('corridors: ids, names, roads, usual times, commuters and paths', () => {
    expect(corridors).toEqual([
      { id: 'lipa', name: 'Lipa City', via: 'JP Laurel Hwy', usualMin: 50, commuters: 140,
        path: [[13.7842, 121.0744], [13.7875, 121.0705], [13.7935, 121.0655], [13.8, 121.064], [13.81, 121.07]] },
      { id: 'batangas', name: 'Batangas City proper', via: 'P. Burgos', usualMin: 20, commuters: 210,
        path: [[13.7842, 121.0744], [13.778, 121.069], [13.77, 121.064], [13.7575, 121.058]] },
      { id: 'bauan', name: 'Bauan / San Pascual', via: 'Diversion Rd', usualMin: 35, commuters: 60,
        path: [[13.7842, 121.0744], [13.783, 121.062], [13.786, 121.045], [13.79, 121.02]] },
      { id: 'sanjose', name: 'San Jose / Ibaan', via: 'Batangas–Lipa Rd', usualMin: 30, commuters: 85,
        path: [[13.7842, 121.0744], [13.792, 121.085], [13.805, 121.1], [13.82, 121.115]] },
      { id: 'tanauan', name: 'Tanauan / Sto. Tomas', via: 'STAR Tollway', usualMin: 65, commuters: 45,
        path: [[13.7842, 121.0744], [13.795, 121.078], [13.82, 121.085], [13.85, 121.095]] },
    ])
  })

  it('every corridor path starts at the campus location object', () => {
    for (const c of corridors) expect(c.path[0]).toBe(CAMPUS)
  })
})

describe('campus registry', () => {
  it('keys each campus by its own id', () => {
    for (const [key, campus] of Object.entries(campuses)) expect(campus.id).toBe(key)
  })

  it('resolves the default campus to Alangilan', () => {
    expect(DEFAULT_CAMPUS_ID).toBe('alangilan')
    expect(DEFAULT_CAMPUS).toBe(alangilan)
    expect(getCampus('alangilan')).toBe(alangilan)
  })

  it('names Alangilan formally and in the UI form used today', () => {
    expect(alangilan.name).toBe('Batangas State University - Alangilan Campus')
    expect(alangilan.shortName).toBe('BatStateU Alangilan')
  })

  it('has unique corridor and spot ids within each campus', () => {
    for (const campus of Object.values(campuses)) {
      const corridorIds = campus.corridors.map((c) => c.id)
      const spotIds = campus.spots.map((s) => s.id)
      expect(new Set(corridorIds).size).toBe(corridorIds.length)
      expect(new Set(spotIds).size).toBe(spotIds.length)
    }
  })

  it('starts every corridor path at the campus location', () => {
    for (const campus of Object.values(campuses)) {
      for (const c of campus.corridors) expect(c.path[0]).toBe(campus.location)
    }
  })
})

describe('data.ts compatibility aliases', () => {
  it('CAMPUS and corridors are the default campus registry values', () => {
    expect(CAMPUS).toBe(DEFAULT_CAMPUS.location)
    expect(corridors).toBe(DEFAULT_CAMPUS.corridors)
  })

  it('corridorById returns the registry corridor objects', () => {
    for (const c of DEFAULT_CAMPUS.corridors) expect(corridorById(c.id)).toBe(c)
  })
})

describe('spot seeds and fixture snapshots', () => {
  it('fixture spots are the seeds plus occupancy, in seed order', () => {
    for (const kind of ['clear', 'disrupted'] as const) {
      const spots = fixture(kind, NOW).spots
      expect(spots.map(({ occupied: _occupied, ...rest }) => rest)).toEqual(DEFAULT_CAMPUS.spots)
    }
  })

  it('fixture spots keep the original key order', () => {
    for (const s of fixture('clear', NOW).spots) {
      expect(Object.keys(s)).toEqual(['id', 'name', 'walkMin', 'capacity', 'occupied', 'amenities', 'pos'])
    }
  })

  it('fixture spots share no nested objects with the seeds', () => {
    const spots = fixture('disrupted', NOW).spots
    spots.forEach((s, i) => {
      const seed = DEFAULT_CAMPUS.spots[i]
      expect(s).not.toBe(seed)
      expect(s.amenities).not.toBe(seed.amenities)
      expect(s.pos).not.toBe(seed.pos)
    })
  })

  it('separate fixture calls share no nested spot objects', () => {
    const a = fixture('clear', NOW).spots
    const b = fixture('clear', NOW).spots
    a.forEach((s, i) => {
      expect(s.amenities).not.toBe(b[i].amenities)
      expect(s.pos).not.toBe(b[i].pos)
    })
  })

  it('building and changing snapshots leaves the registry untouched', () => {
    const before = structuredClone(campuses)

    const snap = fixture('disrupted', NOW)
    // The kinds of in-place edits a careless caller could make to snapshot data.
    snap.spots[0].amenities.food = false
    snap.spots[0].pos[0] = 0
    snap.spots[1].occupied = 499
    const state = {
      ready: true, role: 'student', staffRole: 'DRRMO Coordinator', corridorId: 'lipa', scenario: 'disrupted',
      lowBattery: false, batteryHint: false, online: true, backend: 'device', snapshot: snap, savedAt: NOW,
      weather: fallbackWeather(NOW), spotId: null, toast: null,
    } satisfies State
    studentView(state, NOW)
    fixture('clear', NOW)

    expect(campuses).toEqual(before)
  })
})

// Stage 2A: Pablo Borbon and Malvar are registered as identity-only campuses. Malvar's location
// is a proposed, map-derived coordinate that has not been verified on-site.
describe('Stage 2A: Pablo Borbon identity-only registration', () => {
  it('registers exactly Alangilan, Pablo Borbon and Malvar', () => {
    expect(Object.keys(campuses)).toEqual(['alangilan', 'pablo-borbon', 'malvar'])
    expect(getCampus('pablo-borbon')).toBe(pabloBorbon)
  })

  it('pins Pablo Borbon identity', () => {
    expect(pabloBorbon.id).toBe('pablo-borbon')
    expect(pabloBorbon.name).toBe('Batangas State University - Pablo Borbon Campus')
    expect(pabloBorbon.shortName).toBe('BatStateU Pablo Borbon')
  })

  it('pins Pablo Borbon location (OSM node 8345194517)', () => {
    expect(pabloBorbon.location).toEqual([13.7554660, 121.0536404])
  })

  it('has no corridors or safe spots yet (identity-only)', () => {
    expect(pabloBorbon.corridors).toEqual([])
    expect(pabloBorbon.spots).toEqual([])
  })

  it('keeps Alangilan as a usable default campus', () => {
    expect(DEFAULT_CAMPUS_ID).toBe('alangilan')
    expect(DEFAULT_CAMPUS).toBe(alangilan)
    expect(DEFAULT_CAMPUS.corridors.length).toBeGreaterThan(0)
    expect(DEFAULT_CAMPUS.spots.length).toBeGreaterThan(0)
  })

  it('has globally unique corridor and spot ids, and no reserved corridor ids', () => {
    const all = Object.values(campuses)
    const corridorIds = all.flatMap((c) => c.corridors.map((x) => x.id))
    const spotIds = all.flatMap((c) => c.spots.map((x) => x.id))
    expect(new Set(corridorIds).size).toBe(corridorIds.length)
    expect(new Set(spotIds).size).toBe(spotIds.length)
    for (const id of corridorIds) expect(['campus', 'all']).not.toContain(id)
  })

  it('places every campus inside Batangas province at a distinct location', () => {
    const locations = Object.values(campuses).map((c) => c.location)
    for (const [lat, lng] of locations) {
      expect(Number.isFinite(lat) && Number.isFinite(lng)).toBe(true)
      expect(lat).toBeGreaterThanOrEqual(13.4)
      expect(lat).toBeLessThanOrEqual(14.3)
      expect(lng).toBeGreaterThanOrEqual(120.5)
      expect(lng).toBeLessThanOrEqual(121.6)
    }
    expect(new Set(locations.map((l) => l.join(','))).size).toBe(locations.length)
  })

  it('leaves Alangilan exactly as in Stage 1', () => {
    const L: [number, number] = [13.7842, 121.0744]
    expect(alangilan).toEqual({
      id: 'alangilan',
      name: 'Batangas State University - Alangilan Campus',
      shortName: 'BatStateU Alangilan',
      location: L,
      corridors: [
        { id: 'lipa', name: 'Lipa City', via: 'JP Laurel Hwy', usualMin: 50, commuters: 140,
          path: [L, [13.7875, 121.0705], [13.7935, 121.0655], [13.8, 121.064], [13.81, 121.07]] },
        { id: 'batangas', name: 'Batangas City proper', via: 'P. Burgos', usualMin: 20, commuters: 210,
          path: [L, [13.778, 121.069], [13.77, 121.064], [13.7575, 121.058]] },
        { id: 'bauan', name: 'Bauan / San Pascual', via: 'Diversion Rd', usualMin: 35, commuters: 60,
          path: [L, [13.783, 121.062], [13.786, 121.045], [13.79, 121.02]] },
        { id: 'sanjose', name: 'San Jose / Ibaan', via: 'Batangas–Lipa Rd', usualMin: 30, commuters: 85,
          path: [L, [13.792, 121.085], [13.805, 121.1], [13.82, 121.115]] },
        { id: 'tanauan', name: 'Tanauan / Sto. Tomas', via: 'STAR Tollway', usualMin: 65, commuters: 45,
          path: [L, [13.795, 121.078], [13.82, 121.085], [13.85, 121.095]] },
      ],
      spots: [
        { id: 'cics', name: 'CICS Lobby', walkMin: 3, capacity: 180,
          amenities: { power: true, water: true, food: true }, pos: [13.7849, 121.0745] },
        { id: 'gym', name: 'Gymnasium', walkMin: 6, capacity: 500,
          amenities: { power: true, water: true, food: false }, pos: [13.7838, 121.0727] },
        { id: 'library', name: 'Library', walkMin: 4, capacity: 150,
          amenities: { power: true, water: false, food: false }, pos: [13.7832, 121.0752] },
      ],
    })
  })
})

describe('Stage 2A: Malvar identity-only registration', () => {
  it('is registered under its id', () => {
    expect(getCampus('malvar')).toBe(malvar)
  })

  it('pins Malvar identity', () => {
    expect(malvar.id).toBe('malvar')
    expect(malvar.name).toBe('Batangas State University - JPLPC-Malvar Campus')
    expect(malvar.shortName).toBe('BatStateU JPLPC-Malvar')
  })

  it('pins Malvar location (team-supplied map pin, not the polygon center)', () => {
    expect(malvar.location).toEqual([14.0449, 121.1569])
  })

  it('has no corridors or safe spots yet (identity-only)', () => {
    expect(malvar.corridors).toEqual([])
    expect(malvar.spots).toEqual([])
  })

  it('does not become the default campus', () => {
    expect(DEFAULT_CAMPUS_ID).toBe('alangilan')
    expect(DEFAULT_CAMPUS).not.toBe(malvar)
  })
})
