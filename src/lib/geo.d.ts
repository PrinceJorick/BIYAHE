// Type declarations for ./geo.js (plain JavaScript so the developer-only route generator can run
// it with plain `node`). Keep in step with geo.js; geo.test.ts imports through these declarations.
import type { LatLng } from '../types'

/** Converts an OSRM / GeoJSON position [lon, lat] into a BIYAHE LatLng [lat, lng]. */
export function osrmToLatLng(position: readonly number[]): LatLng
export function isValidLatLng(p: unknown): p is LatLng
/** Sanity rectangle only — not a provincial or administrative boundary. See geo.js. */
export const ALANGILAN_ROUTING_BOUNDS: Readonly<{ minLat: number; maxLat: number; minLng: number; maxLng: number }>
export function withinAlangilanRoutingBounds(p: unknown): boolean
export function haversineM(a: LatLng, b: LatLng): number
export function pathLengthM(path: readonly LatLng[]): number
export function maxSegmentM(path: readonly LatLng[]): number
export function simplify(path: readonly LatLng[], toleranceM: number): LatLng[]
export function roundLatLng(p: LatLng, decimals?: number): LatLng
export function dedupeConsecutive(path: readonly LatLng[]): LatLng[]
