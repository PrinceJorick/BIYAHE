// Type declarations for ./routeChecks.js (plain JavaScript for the developer-only route generator).
import type { LatLng } from '../types'

export type Step = { name?: string | null; ref?: string | null; distanceM: number }
export type PrimaryRoad = { label: string; name: string }

export function normalizeRoadName(s: string | null | undefined): string
export function matchPrimaryRoads(steps: readonly Step[], primaryRoads: readonly PrimaryRoad[], totalM: number): {
  matchedM: number; share: number; perRoad: Record<string, number>
}

export function localFrame(origin: LatLng): { toXY: (p: LatLng) => [number, number]; toLatLng: (xy: [number, number]) => LatLng }

export const ENDPOINT_ZONE_M: number
export type ZoneExcess =
  | { measurable: true; entryIndex: number; entryT: number; entryPoint: LatLng; remainingM: number; directM: number; excessM: number }
  | { measurable: false; entryIndex: null; entryT: null; entryPoint: null; remainingM: null; directM: null; excessM: null }
export function computeZoneExcess(path: readonly LatLng[], ref: LatLng, radiusM?: number): ZoneExcess
export function classifyOvershoot(excess: number | null): 'none' | 'review' | 'fail' | 'not-measurable'
export function classifySnappedEndLoop(excess: number | null): 'none' | 'review' | 'not-measurable'

export function bearingDeg(a: LatLng, b: LatLng): number
export function compassPoint(deg: number): string
export function pointBeforeEnd(path: readonly LatLng[], distanceM: number): LatLng
export function finalApproach(path: readonly LatLng[], lastM?: number): {
  bearingDeg: number; compass: string; from: LatLng; to: LatLng; measuredOverM: number; shortRoute: boolean
}

export const NEAR_STRAIGHT_MIN_M: number
export const NEAR_STRAIGHT_RATIO: number
export function isNearStraight(straightM: number, lengthM: number): boolean
export function nearStraight(path: readonly LatLng[]): { straightM: number; lengthM: number; ratio: number | null; warn: boolean }

export type BearingConstraint = { index: number; bearingDeg: number; rangeDeg: number }
export function buildBearingsParam(coordCount: number, constraints: readonly BearingConstraint[] | null | undefined): string | null
export function validateApproach(a: unknown): string[]

export function detectCampusExit(steps: readonly Step[], accessNames: readonly string[], primaryRoads: readonly PrimaryRoad[]): {
  usesAccessRoads: boolean; steps: { name: string | null; ref: string | null; distanceM: number }[]; distanceM: number
}

export function findPositiveClaims(text: string): { line: number; word: string; text: string }[]

export type Approach = { coordinate: 'end'; bearingDeg: number; rangeDeg: number; source: string; reason: string; addedBy: string; addedOn: string }
export type ViaPoint = { lat: number; lon: number; osmWayId: number | null; osmRoadName: string | null; source: string; reason: string; addedBy: string; addedOn: string }
export type CorridorConfig = {
  id: string
  appViaLabel: string
  destination: string
  end: LatLng
  pathEnds: 'partial' | null
  vias: ViaPoint[]
  primaryRoads: PrimaryRoad[]
  approach?: Approach
  auxSnappedEndExcess?: boolean
}
export const CAMPUS: LatLng
export const ROAD_GROUP_SOURCE: string
export const CAMPUS_ACCESS_ROADS: string[]
export const CORRIDORS: CorridorConfig[]
