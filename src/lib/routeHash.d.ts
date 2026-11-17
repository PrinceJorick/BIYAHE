// Type declarations for ./routeHash.js (browser-safe route hashing shared by the route tools and the app).
import type { LatLng } from '../types'

export function sha256Hex(bytes: Uint8Array): string
export function geojsonSha256(bytes: Uint8Array | ArrayBuffer): string
export function recordSha256(content: string | Uint8Array): string
export const samePoint: (a: readonly number[], b: readonly number[]) => boolean
export function serializeAppPath(appPath: readonly LatLng[], campus: LatLng): string
export function routeGeometryHash(appPath: readonly LatLng[], campus: LatLng): string
export function buildAppPath(campus: LatLng, roadPath: readonly LatLng[]): LatLng[]
