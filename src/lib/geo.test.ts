// Phase 1 routing: pure geospatial helpers, including the [lon, lat] → [lat, lng] conversion.
import { describe, expect, it } from 'vitest'
import type { LatLng } from '../types'
import {
  ALANGILAN_ROUTING_BOUNDS, dedupeConsecutive, haversineM, isValidLatLng, maxSegmentM, osrmToLatLng,
  pathLengthM, roundLatLng, simplify, withinAlangilanRoutingBounds,
} from './geo'

// Shaped like an OSRM /route response (geometries=geojson). Written by hand; no network.
const OSRM_FIXTURE = {
  code: 'Ok',
  routes: [{
    distance: 0,
    geometry: { type: 'LineString', coordinates: [[121.0744, 13.7842], [121.0705, 13.7875], [121.0655, 13.7935]] },
  }],
}

describe('osrmToLatLng (coordinate order)', () => {
  it('turns [lon, lat] into [lat, lng]', () => {
    expect(osrmToLatLng([121.0744, 13.7842])).toEqual([13.7842, 121.0744])
  })

  it('converts a whole OSRM geometry into valid in-bounds [lat, lng] points', () => {
    const path = OSRM_FIXTURE.routes[0].geometry.coordinates.map(osrmToLatLng)
    expect(path).toEqual([[13.7842, 121.0744], [13.7875, 121.0705], [13.7935, 121.0655]])
    for (const p of path) {
      expect(isValidLatLng(p)).toBe(true)
      expect(withinAlangilanRoutingBounds(p)).toBe(true)
    }
  })

  it('ignores a third (altitude) element', () => {
    expect(osrmToLatLng([121.0744, 13.7842, 25])).toEqual([13.7842, 121.0744])
  })

  it('throws on malformed positions instead of guessing', () => {
    expect(() => osrmToLatLng([121.07])).toThrow(TypeError)
    expect(() => osrmToLatLng('121.07,13.78' as unknown as number[])).toThrow(TypeError)
    expect(() => osrmToLatLng(['121.07', '13.78'] as unknown as number[])).toThrow(TypeError)
  })
})

describe('isValidLatLng', () => {
  it('accepts finite in-range pairs', () => {
    expect(isValidLatLng([13.7842, 121.0744])).toBe(true)
    expect(isValidLatLng([-90, 180])).toBe(true)
  })

  it('rejects NaN, Infinity, out-of-range and malformed values', () => {
    for (const bad of [[NaN, 121], [13.78, Infinity], [-Infinity, 121], [91, 121], [13.78, 181], [13.78], [13.78, 121, 0], null, '13,121']) {
      expect(isValidLatLng(bad)).toBe(false)
    }
  })
})

describe('withinAlangilanRoutingBounds (sanity rectangle, not a boundary)', () => {
  it('accepts the campus and current corridor endpoints', () => {
    for (const p of [[13.7842, 121.0744], [13.81, 121.07], [13.7575, 121.058], [13.79, 121.02], [13.82, 121.115], [13.85, 121.095]] as LatLng[]) {
      expect(withinAlangilanRoutingBounds(p)).toBe(true)
    }
  })

  it('rejects a swapped [lon, lat] pair', () => {
    expect(withinAlangilanRoutingBounds([121.0744, 13.7842])).toBe(false)
  })

  it('rejects points far outside the area and invalid values', () => {
    expect(withinAlangilanRoutingBounds([14.5995, 120.9842])).toBe(false) // Manila
    expect(withinAlangilanRoutingBounds([NaN, 121])).toBe(false)
  })

  it('has non-overlapping latitude and longitude ranges, so swaps are always caught', () => {
    const b = ALANGILAN_ROUTING_BOUNDS
    expect(b.maxLat).toBeLessThan(b.minLng)
  })
})

describe('distances', () => {
  it('haversineM: one degree of latitude is about 111.2 km', () => {
    expect(haversineM([0, 0], [1, 0])).toBeCloseTo(111_195, 0)
    expect(haversineM([13.7842, 121.0744], [13.7842, 121.0744])).toBe(0)
  })

  it('pathLengthM sums segments; maxSegmentM finds the longest', () => {
    const path: LatLng[] = [[0, 0], [0.001, 0], [0.004, 0]]
    expect(pathLengthM(path)).toBeCloseTo(haversineM([0, 0], [0.004, 0]), 6)
    expect(maxSegmentM(path)).toBeCloseTo(haversineM([0.001, 0], [0.004, 0]), 6)
    expect(pathLengthM([[0, 0]])).toBe(0)
    expect(maxSegmentM([])).toBe(0)
  })
})

describe('simplify', () => {
  it('drops collinear points and keeps the endpoints', () => {
    const line: LatLng[] = [[13.78, 121.07], [13.781, 121.07], [13.782, 121.07], [13.783, 121.07]]
    expect(simplify(line, 1)).toEqual([[13.78, 121.07], [13.783, 121.07]])
  })

  it('keeps a corner that deviates more than the tolerance', () => {
    const corner: LatLng[] = [[13.78, 121.07], [13.781, 121.07], [13.781, 121.071], [13.781, 121.072]]
    expect(simplify(corner, 5)).toEqual([[13.78, 121.07], [13.781, 121.07], [13.781, 121.072]])
  })

  it('does not modify its input', () => {
    const line: LatLng[] = [[13.78, 121.07], [13.781, 121.07], [13.782, 121.07]]
    const copy = structuredClone(line)
    simplify(line, 1)
    expect(line).toEqual(copy)
  })
})

describe('roundLatLng and dedupeConsecutive', () => {
  it('rounds to 5 decimals by default', () => {
    expect(roundLatLng([13.784212345, 121.074456789])).toEqual([13.78421, 121.07446])
  })

  it('removes consecutive duplicates only', () => {
    expect(dedupeConsecutive([[1, 1], [1, 1], [2, 2], [1, 1]])).toEqual([[1, 1], [2, 2], [1, 1]])
  })
})
