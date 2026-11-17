// Phase 1 routing: map-fit points. mapFitPoints is a characterization of CorridorMap's inline logic
// before extraction; its expected values are written out literally so any drift is caught.
import { describe, expect, it } from 'vitest'
import { CAMPUS, corridorById, corridors, fixture } from '../data'
import type { LatLng } from '../types'
import { fitKey, fullFitPoints, mapFitPoints, type MapFitInput } from './mapView'

const NOW = Date.UTC(2026, 10, 16, 7, 0)
const SPOTS: LatLng[] = [[13.7849, 121.0745], [13.7838, 121.0727], [13.7832, 121.0752]]

// Path points 1–2 of each corridor, as they are today.
const PATH_1_2: Record<string, LatLng[]> = {
  lipa: [[13.7875, 121.0705], [13.7935, 121.0655]],
  batangas: [[13.778, 121.069], [13.77, 121.064]],
  bauan: [[13.783, 121.062], [13.786, 121.045]],
  sanjose: [[13.792, 121.085], [13.805, 121.1]],
  tanauan: [[13.795, 121.078], [13.82, 121.085]],
}

const input = (corridorId: string, kind: 'clear' | 'disrupted'): MapFitInput => ({
  campus: CAMPUS, corridors, corridor: corridorById(corridorId), spots: fixture(kind, NOW).spots,
})

// Smallest box around a list of points.
const box = (pts: LatLng[]) => ({
  minLat: Math.min(...pts.map((p) => p[0])), maxLat: Math.max(...pts.map((p) => p[0])),
  minLng: Math.min(...pts.map((p) => p[1])), maxLng: Math.max(...pts.map((p) => p[1])),
})
const contains = (b: ReturnType<typeof box>, p: LatLng) =>
  p[0] >= b.minLat && p[0] <= b.maxLat && p[1] >= b.minLng && p[1] <= b.maxLng

describe('mapFitPoints (unchanged behaviour)', () => {
  for (const kind of ['clear', 'disrupted'] as const) {
    it(`staff (${kind}): the first three points of every corridor`, () => {
      expect(mapFitPoints('staff', input('lipa', kind))).toEqual([
        [13.7842, 121.0744], [13.7875, 121.0705], [13.7935, 121.0655],
        [13.7842, 121.0744], [13.778, 121.069], [13.77, 121.064],
        [13.7842, 121.0744], [13.783, 121.062], [13.786, 121.045],
        [13.7842, 121.0744], [13.792, 121.085], [13.805, 121.1],
        [13.7842, 121.0744], [13.795, 121.078], [13.82, 121.085],
      ])
    })

    for (const id of Object.keys(PATH_1_2)) {
      it(`student (${kind}, ${id}): campus, every spot, then path points 1–2`, () => {
        expect(mapFitPoints('student', input(id, kind))).toEqual([[13.7842, 121.0744], ...SPOTS, ...PATH_1_2[id]])
      })
    }
  }

  it('matches the expressions CorridorMap used inline before extraction', () => {
    for (const c of corridors) {
      const i = input(c.id, 'disrupted')
      expect(mapFitPoints('staff', i)).toEqual(corridors.flatMap((x) => x.path.slice(0, 3)))
      expect(mapFitPoints('student', i)).toEqual([CAMPUS, ...i.spots.map((x) => x.pos), ...c.path.slice(1, 3)])
    }
  })
})

describe('fullFitPoints (not wired into the map yet)', () => {
  it('staff: bounds contain every point of every corridor', () => {
    const b = box(fullFitPoints('staff', input('lipa', 'disrupted')))
    for (const c of corridors) for (const p of c.path) expect(contains(b, p)).toBe(true)
  })

  it('student: bounds contain the whole own corridor, the campus and every spot', () => {
    for (const c of corridors) {
      const i = input(c.id, 'disrupted')
      const b = box(fullFitPoints('student', i))
      for (const p of [...c.path, CAMPUS, ...i.spots.map((x) => x.pos)]) expect(contains(b, p)).toBe(true)
    }
  })

  it('covers far points that mapFitPoints misses on a dense path', () => {
    const dense = { ...corridors[0], path: Array.from({ length: 50 }, (_, k): LatLng => [13.7842 + k * 0.001, 121.0744]) }
    const i: MapFitInput = { campus: CAMPUS, corridors: [dense], corridor: dense, spots: [] }
    const far: LatLng = dense.path[49]
    expect(contains(box(mapFitPoints('student', i)), far)).toBe(false)
    expect(contains(box(fullFitPoints('student', i)), far)).toBe(true)
  })
})

describe('fitKey', () => {
  it('is equal for equal point lists and differs when any point changes', () => {
    const a: LatLng[] = [[13.7842, 121.0744], [13.7875, 121.0705]]
    expect(fitKey(a)).toBe(fitKey(structuredClone(a)))
    expect(fitKey(a)).not.toBe(fitKey([[13.7842, 121.0744], [13.7875, 121.0706]]))
    expect(fitKey(a)).not.toBe(fitKey(a.slice(0, 1)))
  })
})
