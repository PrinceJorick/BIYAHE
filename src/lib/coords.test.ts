// Coordinate-order helpers, checked with the exact supplied safe-spot coordinates.
import { describe, expect, it } from 'vitest'
import {
  assertLatLng, fromLatLng, isValidCoordinate, latLngToLngLat, lngLatToLatLng, osrmPoint, straightLineWalkMin, toLatLng,
  walkMinutesFor, wktPoint, WALK_M_PER_MIN,
} from './coords'
import type { LatLng } from '../types'

const LOUNGE: LatLng = [13.78393267903075, 121.07417575704717]
const PB_GYM: LatLng = [13.753079262668649, 121.05277271784234]

describe('coordinate conversions', () => {
  it('round-trips [lat, lng] ↔ { lat, lng } without loss', () => {
    expect(fromLatLng(LOUNGE)).toEqual({ lat: 13.78393267903075, lng: 121.07417575704717 })
    expect(toLatLng(fromLatLng(PB_GYM))).toEqual(PB_GYM)
  })

  it('flips to GeoJSON / OSRM [lng, lat] and back', () => {
    expect(latLngToLngLat(LOUNGE)).toEqual([121.07417575704717, 13.78393267903075])
    expect(lngLatToLatLng(latLngToLngLat(PB_GYM))).toEqual(PB_GYM)
  })

  it('builds OSRM path points as "lng,lat"', () => {
    expect(osrmPoint(PB_GYM)).toBe('121.05277271784234,13.753079262668649')
  })

  it('builds PostGIS WKT with longitude first', () => {
    expect(wktPoint(LOUNGE)).toBe('SRID=4326;POINT(121.07417575704717 13.78393267903075)')
  })

  it('rejects out-of-range and non-finite values', () => {
    // A swapped Batangas pair puts 121 in the latitude slot, which is out of range.
    expect(() => assertLatLng([121.07417575704717, 13.78393267903075])).toThrow(RangeError)
    expect(() => osrmPoint([121.05277271784234, 13.753079262668649])).toThrow(RangeError)
    expect(() => assertLatLng([200, 13])).toThrow(RangeError)
    expect(() => assertLatLng([13, 181])).toThrow(RangeError)
    expect(() => assertLatLng([Number.NaN, 121])).toThrow(RangeError)
    expect(() => osrmPoint([91, 0])).toThrow(RangeError)
    expect(isValidCoordinate({ lat: 13.75, lng: 121.05 })).toBe(true)
    expect(isValidCoordinate({ lat: -91, lng: 0 })).toBe(false)
  })

  it('rejects malformed GeoJSON positions', () => {
    expect(() => lngLatToLatLng([121])).toThrow(TypeError)
    expect(() => lngLatToLatLng(['121', '13'] as unknown as number[])).toThrow(TypeError)
  })
})

describe('walking estimates', () => {
  it('uses one configurable walking speed', () => {
    expect(WALK_M_PER_MIN).toBe(75)
    expect(walkMinutesFor(0)).toBe(1)
    expect(walkMinutesFor(75)).toBe(1)
    expect(walkMinutesFor(76)).toBe(2)
    expect(walkMinutesFor(300, 60)).toBe(5)
  })

  it('gives the Pablo Borbon gym a 4-minute straight-line estimate from the campus point', () => {
    expect(straightLineWalkMin([13.75547, 121.05364], PB_GYM)).toBe(4)
  })
})
