import { describe, expect, it } from 'vitest'
import { fixture } from '../data'
import { capacityTotals, estimateCapacity, SPOT_CAPACITY_RULE } from './capacity'
import { campuses, SPOT_FOOTPRINTS } from './index'

describe('estimateCapacity', () => {
  it('is usable area ÷ 2 m² per person, rounded down to 10', () => {
    expect(SPOT_CAPACITY_RULE).toEqual({ m2PerPerson: 2, usableShare: { hall: 0.75, library: 0.6 } })
    // Sparta Gymnasium: 2,773 m² × 0.75 ÷ 2 = 1,039.875 → 1,030.
    expect(estimateCapacity({ m2: 2773, use: 'hall', source: '', verified: true })).toBe(1030)
    expect(estimateCapacity({ m2: 1537, use: 'hall', source: '', verified: true })).toBe(570)
    expect(estimateCapacity({ m2: 776, use: 'library', source: '', verified: true })).toBe(230)
    expect(estimateCapacity({ m2: 860, use: 'library', source: '', verified: false })).toBe(250)
  })
})

describe.each(Object.values(campuses))('$id safe spots', (campus) => {
  it('have unique ids, and each capacity is either null (not assessed) or exactly the footprint estimate', () => {
    const ids = campus.spots.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of campus.spots) {
      const f = SPOT_FOOTPRINTS[s.id]
      if (s.capacity == null) expect(f, s.id).toBeUndefined()
      else {
        expect(Number.isInteger(s.capacity), s.id).toBe(true)
        expect(s.capacity, s.id).toBeGreaterThan(0)
        expect(s.capacity, s.id).toBe(estimateCapacity(f))
      }
    }
  })

  it('campus total equals the sum of assessed spot capacities, for every scenario', () => {
    for (const kind of ['clear', 'disrupted'] as const) {
      const snap = fixture(kind, 0, campus)
      const t = capacityTotals(snap.spots)
      const assessed = snap.spots.filter((s) => s.capacity != null)
      expect(t.capacity).toBe(assessed.reduce((n, s) => n + s.capacity!, 0))
      expect(t.occupied).toBe(snap.spots.reduce((n, s) => n + s.occupied, 0))
      expect(t.left).toBe(assessed.reduce((n, s) => n + Math.max(0, s.capacity! - s.occupied), 0))
      expect(t.unassessed).toBe(snap.spots.length - assessed.length)
      for (const s of assessed) expect(s.occupied).toBeLessThanOrEqual(s.capacity!)
    }
  })
})

it('campus totals (audit record)', () => {
  const totals = Object.fromEntries(Object.values(campuses).map((c) => [c.id, capacityTotals(c.spots.map((s) => ({ ...s, occupied: 0 }))).capacity]))
  expect(totals).toEqual({ alangilan: 1280, 'pablo-borbon': 800, malvar: 0 })
})
