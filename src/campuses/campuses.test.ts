// Campus registry tests. The first block pins the Alangilan route data as it existed before the registry was
// introduced; the drawn paths now follow roads (./alangilan.preview.roads.ts) while the hand-drawn ones stay
// pinned as the fallback.
import { describe, expect, it } from 'vitest'
import { CAMPUS, corridorById, corridors, fallbackWeather, fixture } from '../data'
import { studentView } from '../lib/derive'
import type { State } from '../lib/store'
import { alangilan, ALANGILAN_HAND_DRAWN_CORRIDORS, alangilanRouteGeometry } from './alangilan'
import { ALANGILAN_PREVIEW_ROADS } from './alangilan.preview.roads'
import { campuses, DEFAULT_CAMPUS, DEFAULT_CAMPUS_ID, getCampus } from './index'
import { malvar, malvarRouteGeometry } from './malvar'
import { pabloBorbon, pabloBorbonRouteGeometry } from './pabloBorbon'

const NOW = Date.UTC(2026, 10, 16, 7, 0)

describe('Alangilan reference data (pinned before the registry move)', () => {
  it('campus location', () => {
    expect(CAMPUS).toEqual([13.7842, 121.0744])
  })

  it('hand-drawn fallback corridors: ids, names, roads, usual times, commuters and paths', () => {
    expect(ALANGILAN_HAND_DRAWN_CORRIDORS).toEqual([
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

  it('every hand-drawn path starts at the campus location object', () => {
    for (const c of ALANGILAN_HAND_DRAWN_CORRIDORS) expect(c.path[0]).toBe(CAMPUS)
  })

  it('draws the road-following paths, with every other corridor field unchanged', () => {
    expect(alangilanRouteGeometry.source).toBe('preview')
    expect(corridors.map(({ path: _p, ...rest }) => rest)).toEqual(ALANGILAN_HAND_DRAWN_CORRIDORS.map(({ path: _p, ...rest }) => rest))
    for (const c of corridors) expect(c.path).toEqual(ALANGILAN_PREVIEW_ROADS.routes.find((r) => r.routeId === c.id)!.path)
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
      for (const c of campus.corridors) expect(c.path[0]).toEqual(campus.location)
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

// Pablo Borbon and Malvar: usable campuses with road-following routes and researched safe spots.
describe('Pablo Borbon', () => {
  it('registers exactly Alangilan, Pablo Borbon and Malvar', () => {
    expect(Object.keys(campuses)).toEqual(['alangilan', 'pablo-borbon', 'malvar'])
    expect(getCampus('pablo-borbon')).toBe(pabloBorbon)
  })

  it('pins Pablo Borbon identity', () => {
    expect(pabloBorbon.id).toBe('pablo-borbon')
    expect(pabloBorbon.name).toBe('Batangas State University - Pablo Borbon Campus')
    expect(pabloBorbon.shortName).toBe('BatStateU Pablo Borbon')
  })

  it('pins Pablo Borbon location (OSM node 8345194517, rounded to 5 decimals)', () => {
    expect(pabloBorbon.location).toEqual([13.75547, 121.05364])
  })

  it('has four routes drawn along roads and two safe spots', () => {
    expect(pabloBorbon.corridors.map((c) => c.id)).toEqual(['pb-lipa', 'pb-sanjose', 'pb-bauan', 'pb-rosario'])
    expect(pabloBorbonRouteGeometry.source).toBe('preview')
    for (const c of pabloBorbon.corridors) expect(c.path.length).toBeGreaterThan(20)
    expect(pabloBorbon.spots.map((x) => x.id)).toEqual(['pb-gym', 'pb-library'])
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

  it('keeps every safe spot within 500 m of its campus', () => {
    const m = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 110_574, (a[1] - b[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180))
    for (const campus of Object.values(campuses)) for (const x of campus.spots) expect(m(x.pos, campus.location)).toBeLessThan(500)
  })

  it('pins the Alangilan safe spots (Sparta Gymnasium and the library)', () => {
    expect(alangilan.spots).toEqual([
      { id: 'gym', name: 'Sparta Gymnasium', walkMin: 1, capacity: 1030,
        amenities: { power: true, water: true, food: false }, pos: [13.78422, 121.07394] },
      { id: 'library', name: 'Einstein Bldg Library, 2nd floor', walkMin: 2, capacity: 250,
        amenities: { power: true, water: false, food: false }, pos: [13.78412, 121.07481] },
    ])
  })
})

describe('Malvar', () => {
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

  it('has four routes drawn along roads and a safe spot', () => {
    expect(malvar.corridors.map((c) => c.id)).toEqual(['mv-lipa', 'mv-tanauan', 'mv-stotomas', 'mv-batangas'])
    expect(malvarRouteGeometry.source).toBe('preview')
    for (const c of malvar.corridors) expect(c.path.length).toBeGreaterThan(20)
    expect(malvar.spots.map((x) => x.id)).toEqual(['mv-gym'])
  })

  it('does not become the default campus', () => {
    expect(DEFAULT_CAMPUS_ID).toBe('alangilan')
    expect(DEFAULT_CAMPUS).not.toBe(malvar)
  })
})
