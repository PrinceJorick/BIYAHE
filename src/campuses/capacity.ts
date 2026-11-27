// Safe-spot capacity: one rule and one calculation for every campus (tests: src/campuses/capacity.test.ts).
//
// No official figure for waiting (not event seating) exists, so capacity = usable floor area ÷ 2 m² per person,
// rounded down to 10. Usable share: 0.75 of a gym or hall floor, 0.6 of a library (shelves and desks). 2 m² is room
// to sit with a bag for a few hours: more than assembly seating (about 0.65 m²), less than the 3.5 m² Sphere
// standard for overnight shelter.
import type { Spot } from '../types'

export const SPOT_CAPACITY_RULE = { m2PerPerson: 2, usableShare: { hall: 0.75, library: 0.6 } } as const

/** A safe spot's floor area and where it comes from. `verified: false` = an estimate that needs review. */
export type Footprint = { m2: number; use: keyof typeof SPOT_CAPACITY_RULE.usableShare; source: string; verified: boolean }
/** A headcount estimate given directly (no measured area); always flagged for review. */
export type PeopleEstimate = { people: number; source: string; verified: false }
export type CapacitySource = Footprint | PeopleEstimate

export const estimateCapacity = (f: CapacitySource) => 'people' in f
  ? f.people
  : Math.floor((f.m2 * SPOT_CAPACITY_RULE.usableShare[f.use]) / SPOT_CAPACITY_RULE.m2PerPerson / 10) * 10

/** Campus totals. Spots without an assessed capacity add to the people waiting but never to the capacity. */
export function capacityTotals(spots: readonly Pick<Spot, 'capacity' | 'occupied'>[]) {
  let capacity = 0, left = 0, occupied = 0, unassessed = 0
  for (const s of spots) {
    occupied += s.occupied
    if (s.capacity == null) unassessed++
    else {
      capacity += s.capacity
      left += Math.max(0, s.capacity - s.occupied)
    }
  }
  return { capacity, left, occupied, unassessed, spots: spots.length }
}
