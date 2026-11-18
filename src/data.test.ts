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

  it('lists the Alangilan safe spots with light occupancy (5% and 25% of capacity; unassessed capacity starts empty)', () => {
    expect(snap.spots).toEqual([
      { id: 'gym', name: 'Sparta Gymnasium', walkMin: 1, capacity: 1030, occupied: 52,
        amenities: { power: true, water: true, food: false }, pos: [13.784276340529747, 121.07413074951742] },
      { id: 'library', name: 'Einstein Bldg Library, 2nd Floor', walkMin: 1, capacity: 250, occupied: 63,
        amenities: { power: true, water: false, food: false }, pos: [13.784168707874697, 121.0749349027738] },
      { id: 'lounge', name: 'Student Lounge', walkMin: 1, capacity: null, occupied: 0,
        amenities: { power: false, water: false, food: false }, pos: [13.78393267903075, 121.07417575704717] },
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

  it('fills the safe spots (gym 361/1030, library full at 250/250, lounge capacity not assessed)', () => {
    expect(snap.spots.map((s) => [s.id, s.occupied, s.capacity])).toEqual([
      ['gym', 361, 1030],
      ['library', 250, 250],
      ['lounge', 0, null],
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
