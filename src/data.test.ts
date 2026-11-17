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
    })
  })

  it('lists the three Alangilan safe spots with light occupancy', () => {
    expect(snap.spots).toEqual([
      { id: 'cics', name: 'CICS Lobby', walkMin: 3, capacity: 180, occupied: 10,
        amenities: { power: true, water: true, food: true }, pos: [13.7849, 121.0745] },
      { id: 'gym', name: 'Gymnasium', walkMin: 6, capacity: 500, occupied: 30,
        amenities: { power: true, water: true, food: false }, pos: [13.7838, 121.0727] },
      { id: 'library', name: 'Library', walkMin: 4, capacity: 150, occupied: 40,
        amenities: { power: true, water: false, food: false }, pos: [13.7832, 121.0752] },
    ])
  })
})

describe("fixture('disrupted')", () => {
  const snap = fixture('disrupted', NOW)

  it('is stamped one minute before now', () => {
    expect(snap.updatedAt).toBe(NOW - 1 * MIN)
  })

  it('closes Lipa (JP Laurel Hwy) with the flooding note', () => {
    expect(snap.corridors.lipa).toEqual({
      status: 'closed', minLo: 135, minHi: 190,
      note: 'Flooding on JP Laurel Hwy near Balagtas. Classes suspended from 3:30 PM.',
      source: 'PAGASA + 3 LGU road reports', provenance: 'estimate',
    })
  })

  it('slows Bauan (Diversion Rd)', () => {
    expect(snap.corridors.bauan).toEqual({
      status: 'slow', minLo: 50, minHi: 65,
      note: 'Heavy traffic and ponding on Diversion Rd.',
      source: 'LGU road reports', provenance: 'estimate',
    })
  })

  it('leaves the other corridors open', () => {
    expect(snap.corridors.batangas).toMatchObject({ status: 'open', minLo: 20, minHi: 20, provenance: 'official' })
    expect(snap.corridors.sanjose).toMatchObject({ status: 'open', minLo: 25, minHi: 35, provenance: 'official' })
    expect(snap.corridors.tanauan).toMatchObject({ status: 'open', minLo: 60, minHi: 70, provenance: 'official' })
    expect(Object.keys(snap.corridors)).toEqual(['lipa', 'batangas', 'bauan', 'sanjose', 'tanauan'])
  })

  it('fills the safe spots (gym 200/500, library full at 150/150)', () => {
    expect(snap.spots.map((s) => [s.id, s.occupied, s.capacity])).toEqual([
      ['cics', 60, 180],
      ['gym', 200, 500],
      ['library', 150, 150],
    ])
  })

  it('carries LGU, PAGASA and Campus advisories, newest first', () => {
    expect(snap.advisories).toEqual([
      expect.objectContaining({
        id: 'lgu-jpl-flood', source: 'LGU', issuer: 'Batangas City DRRMO', severity: 'critical', scope: 'lipa',
        title: 'Flooding on JP Laurel Hwy near Balagtas', issuedAt: NOW - 8 * MIN,
      }),
      expect.objectContaining({
        id: 'pagasa-RA-07', source: 'PAGASA', issuer: 'PAGASA', severity: 'warning', scope: 'all',
        title: 'Orange rainfall warning, Batangas', issuedAt: NOW - 25 * MIN,
      }),
      expect.objectContaining({
        id: 'campus-suspend', source: 'Campus', issuer: 'Campus DRRMO', severity: 'warning', scope: 'campus',
        title: 'Classes suspended from 3:30 PM', issuedAt: NOW - 40 * MIN,
      }),
    ])
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
