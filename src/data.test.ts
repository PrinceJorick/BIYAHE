// Stage 0 characterization tests: they pin down today's Alangilan fixture data so the
// multi-campus work can be checked against it. They describe current behavior; they are
// not a specification.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixture } from './data'

const MIN = 60_000
const NOW = Date.UTC(2026, 10, 16, 7, 0)

const OPEN_NOTE = 'No hazards reported on your route.'
const OPEN_SOURCE = 'PAGASA, Batangas City DRRMO'

describe("fixture('clear')", () => {
  const snap = fixture('clear', NOW)

  it('is stamped two minutes before now and carries no advisories', () => {
    expect(snap.updatedAt).toBe(NOW - 2 * MIN)
    expect(snap.advisories).toEqual([])
  })

  it('reports every corridor open with official usual-time bands', () => {
    const open = (minLo: number, minHi: number) => ({
      status: 'open', minLo, minHi, note: OPEN_NOTE, source: OPEN_SOURCE, provenance: 'official',
    })
    expect(snap.corridors).toEqual({
      lipa: open(45, 55),
      batangas: open(20, 20),
      bauan: open(30, 40),
      sanjose: open(25, 35),
      tanauan: open(60, 70),
      rosario: open(40, 50),
    })
  })

  it('lists the Alangilan safe spots with light occupancy (5% and 25% of capacity, repeating)', () => {
    expect(snap.spots).toEqual([
      { id: 'gym', name: 'Sparta Gymnasium', walkMin: 1, capacity: 1030, occupied: 52,
        amenities: { power: true, water: true, food: false }, pos: [13.784276340529747, 121.07413074951742] },
      { id: 'library', name: 'Einstein Bldg Library, 2nd Floor', walkMin: 1, capacity: 250, occupied: 63,
        amenities: { power: true, water: false, food: false }, pos: [13.784168707874697, 121.0749349027738] },
      { id: 'lounge', name: 'Student Lounge', walkMin: 1, capacity: 150, occupied: 8,
        amenities: { power: false, water: false, food: false }, pos: [13.78393267903075, 121.07417575704717] },
    ])
  })
})

describe("fixture('disrupted')", () => {
  const snap = fixture('disrupted', NOW)

  it('is stamped one minute before now', () => {
    expect(snap.updatedAt).toBe(NOW - 1 * MIN)
  })

  it('closes every route through the flood on JP Laurel Hwy (Lipa and Tanauan share it), with the hazard', () => {
    expect(snap.corridors.lipa).toEqual({
      status: 'closed', minLo: 135, minHi: 190,
      note: 'Flooding on JP Laurel Hwy at Mojon-Tampoy, San Jose.',
      source: 'LGU road reports', provenance: 'estimate', hazard: 'flood',
    })
    expect(snap.corridors.tanauan).toMatchObject({ status: 'closed', hazard: 'flood' })
  })

  it('slows Bauan (Diversion Rd) through the ponding site', () => {
    expect(snap.corridors.bauan).toEqual({
      status: 'slow', minLo: 50, minHi: 65,
      note: 'Ponding and heavy traffic on Diversion Rd at Banaba Kanluran.',
      source: 'LGU road reports', provenance: 'estimate', hazard: 'ponding',
    })
  })

  it('slows every other route through a ponding site, so no route is clear', () => {
    for (const id of ['batangas', 'sanjose', 'rosario']) expect(snap.corridors[id], id).toMatchObject({ status: 'slow', hazard: 'ponding', provenance: 'estimate' })
    expect(Object.keys(snap.corridors)).toEqual(['lipa', 'batangas', 'bauan', 'sanjose', 'tanauan', 'rosario'])
  })

  it('fills the safe spots (gym 361/1030, library full at 250/250, lounge 53/150)', () => {
    expect(snap.spots.map((s) => [s.id, s.occupied, s.capacity])).toEqual([
      ['gym', 361, 1030],
      ['library', 250, 250],
      ['lounge', 53, 150],
    ])
  })

  it('carries one simulated LGU advisory per disrupted route (in route order, with the status it sets), then PAGASA and Campus', () => {
    expect(snap.advisories.map((a) => [a.id, a.scope, a.severity, a.corridorStatus ?? null])).toEqual([
      ['lgu-flood-lipa', 'lipa', 'critical', 'closed'],
      ['lgu-ponding-batangas', 'batangas', 'warning', 'slow'],
      ['lgu-ponding-bauan', 'bauan', 'warning', 'slow'],
      ['lgu-ponding-sanjose', 'sanjose', 'warning', 'slow'],
      ['lgu-flood-tanauan', 'tanauan', 'critical', 'closed'],
      ['lgu-ponding-rosario', 'rosario', 'warning', 'slow'],
      ['pagasa-RA-07', 'all', 'warning', null],
      ['campus-suspend', 'campus', 'warning', null],
    ])
    expect(snap.advisories[0]).toMatchObject({ source: 'LGU', issuer: 'Batangas City DRRMO', title: 'Flooding on JP Laurel Hwy at Mojon-Tampoy, San Jose', issuedAt: NOW - 8 * MIN })
    expect(snap.advisories.every((a) => a.simulated)).toBe(true)
  })
})

describe('fixture() purity', () => {
  it('returns equal but independent snapshots for the same clock', () => {
    for (const kind of ['clear', 'disrupted'] as const) {
      const a = fixture(kind, NOW)
      const b = fixture(kind, NOW)
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
      expect(a.corridors).not.toBe(b.corridors)
      expect(a.spots).not.toBe(b.spots)
    }
  })
})

// The only place fake timers are used: fixture() without an explicit time reads Date.now().
describe('fixture() default timestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stamps from the system clock when no time is given', () => {
    expect(fixture('clear').updatedAt).toBe(NOW - 2 * MIN)
    expect(fixture('disrupted').updatedAt).toBe(NOW - 1 * MIN)
  })
})
