// Coordinate conventions, in one place. Every conversion between orders goes through these helpers; nothing
// else in the app should reverse a coordinate array by hand.
//
//   App data, Leaflet          LatLng   [lat, lng]          (src/types.ts)
//   GeoJSON, OSRM responses    LngLat   [lng, lat]
//   OSRM request path          "lng,lat" strings joined by ";"
//   Supabase / PostGIS         POINT(lng lat) in WKT; safe_spots_view returns lat / lon columns
//   Readable records           { lat, lng }
//
// Latitude and longitude ranges around Batangas do not overlap (lat ≈ 13–14, lng ≈ 121), so a swapped pair is
// caught by any campus-proximity check, and by the range checks below for most of the world.
import type { LatLng } from '../types'
import { haversineM, isValidLatLng, osrmToLatLng } from './geo.js'

export type Coordinate = { lat: number; lng: number }
/** GeoJSON / OSRM order. */
export type LngLat = [number, number]

export { haversineM, isValidLatLng }

export const isValidCoordinate = (c: Coordinate) => isValidLatLng([c.lat, c.lng])

export const toLatLng = ({ lat, lng }: Coordinate): LatLng => [lat, lng]
export const fromLatLng = ([lat, lng]: LatLng): Coordinate => ({ lat, lng })

/** [lat, lng] → GeoJSON / OSRM [lng, lat]. */
export const latLngToLngLat = ([lat, lng]: LatLng): LngLat => [lng, lat]
/** GeoJSON / OSRM [lng, lat] → [lat, lng]. Throws on a malformed position (see geo.js osrmToLatLng). */
export const lngLatToLatLng = (p: readonly number[]): LatLng => osrmToLatLng(p) as LatLng

/** One point of an OSRM request path: "lng,lat". Throws on an invalid coordinate. */
export function osrmPoint(p: LatLng): string {
  assertLatLng(p)
  return `${p[1]},${p[0]}`
}

/** PostGIS WKT for a point: longitude first. */
export function wktPoint(p: LatLng): string {
  assertLatLng(p)
  return `SRID=4326;POINT(${p[1]} ${p[0]})`
}

export function assertLatLng(p: unknown, what = 'coordinate'): asserts p is LatLng {
  if (!isValidLatLng(p)) throw new RangeError(`Invalid ${what}: expected [lat, lng] within ±90 / ±180, got ${JSON.stringify(p)}`)
}

// ── Walking estimates ────────────────────────────────────────────────────────
/**
 * Assumed walking speed for every estimate in the app: 75 m per minute (4.5 km/h), an unhurried pace that
 * allows for stairs and wet ground. Change it here; every straight-line and route-based time follows.
 */
export const WALK_M_PER_MIN = 75

/** Whole minutes to walk `meters`, rounded up, at least 1. */
export const walkMinutesFor = (meters: number, mPerMin = WALK_M_PER_MIN) => Math.max(1, Math.ceil(meters / mPerMin))

/** Straight-line walking estimate between two points, in minutes. A lower bound: real paths are longer. */
export const straightLineWalkMin = (from: LatLng, to: LatLng) => walkMinutesFor(haversineM(from, to))
