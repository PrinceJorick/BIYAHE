// Type declarations for ./routeChecks.js (plain JavaScript for the developer-only route generator).
import type { LatLng } from '../types'
import type {
  EndpointWarningCode, EndpointWarningPolicy, EvidenceResolutionPolicy, EvidenceType, WarningCode,
} from './routeVersions'

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
// ── Approval validation (Phase 2) ───────────────────────────────────────────

// Implemented in ./routeHash.js and re-exported unchanged.
export { buildAppPath, geojsonSha256, recordSha256, routeGeometryHash, serializeAppPath, sha256Hex } from './routeHash'

// Policy types come from the shared schema declarations; they are re-exported, not redefined.
export type { EndpointWarningCode, EvidenceType, WarningCode }
// Records are untrusted input, so their fields stay `string`; the validators check them against the
// typed policy in APPROVAL_SCHEMA_PARAMS / WARNING_SCHEMA_PARAMS.
export type RouteWarning = { code: string; text: string; value: unknown }
export type WarningRule = {
  readonly value: string
  readonly evidenceTypes: EvidenceResolutionPolicy[WarningCode]
  readonly sharedEvidence: boolean
  readonly endpointRelationship: boolean
}
export const WARNING_RULES: { readonly [C in WarningCode]: WarningRule }
export const WARNING_CODES: readonly WarningCode[]
export const ENDPOINT_WARNING_CODES: EndpointWarningPolicy['codes']
export function validateWarning(w: unknown, where?: string): string[]
export function validateWarningList(warnings: unknown, where?: string): string[]

export type EndpointRelationship = {
  requestedEndpoint: LatLng; acceptedEndpoint: LatLng; separationM: number; intendedDestination: string; relationship: string
}
export type Resolution = {
  warningCode: string; outcome: string; resolution: string; reviewer: string; reviewedOn: string
  evidenceType: string; evidenceRef: string; runId: string; routeGeometrySha256: string
  sharedEvidenceId?: string
  conditionsAcknowledged?: { publicAccess: string | null; usability: string | null }
  endpointRelationship?: EndpointRelationship
}
export type HistoryEntry = {
  runId: string; warning: RouteWarning; outcome: string; configChange: string; resolution: string; reviewer: string; reviewedOn: string
}
export type ApprovalRecord = {
  approvalSchemaVersion: string; routingPolicyVersion: string; geometryProcessingVersion: string; warningSchemaVersion: string
  generatorVersion: string; campus: string; routeId: string; runId: string; geojsonSha256: string; routeGeometrySha256: string
  pathEnds: 'partial' | null; reviewedBy: string; reviewedOn: string
  warnings: RouteWarning[]; resolutions: Resolution[]; history: HistoryEntry[]
}
export type SharedEvidence = {
  approvalSchemaVersion: string; evidenceId: string; evidenceType: string; subject: string; segmentsInspected: string[]
  inspectedOn: string; inspectedBy: string
  publicAccess: { status: string; conditions?: string; finding: string }
  usability: { status: string; conditions?: string; finding: string }
  evidenceRefs: string[]; appliesToRoutes: string[]; limitations: string
}

export type EvidenceRefClass =
  | { kind: 'https'; verification: 'structural-only' }
  | { kind: 'repo'; verification: 'committed-file' }
  | { kind: 'invalid'; problem: string }
export function classifyEvidenceRef(ref: unknown, committedFiles?: ReadonlySet<string>): EvidenceRefClass
export function checkEvidenceRef(ref: unknown, committedFiles?: ReadonlySet<string>): string | null
export function validateSharedEvidence(ev: unknown, opts?: { committedFiles?: ReadonlySet<string> }): { valid: boolean; accepting: boolean; problems: string[] }
export function evidenceConditions(ev: unknown): { publicAccess: string | null; usability: string | null }

export type RunRouteData = { status: string; warnings: RouteWarning[]; routeGeometrySha256: string; snappedEnd: LatLng }
export type RecordValidation = { valid: boolean; activatable: boolean; problems: string[]; blockers: string[] }
export function validateApprovalRecord(rec: unknown, ctx: {
  routeId: string
  config: { end: LatLng; pathEnds: 'partial' | null }
  sharedEvidence?: unknown
  sharedEvidenceResult?: { valid: boolean; accepting: boolean }
  committedFiles?: ReadonlySet<string>
  run: null | ({ runId: string; geojsonSha256: string; versions: Record<string, string> } & RunRouteData)
}): RecordValidation

export const APPROVAL_MODES: Readonly<{ local: 'local-diagnostic-run'; committed: 'committed-records-only' }>
export const NOT_VERIFIED_IN_COMMITTED_MODE: readonly string[]
export function validateApprovalSet(opts: {
  records: unknown[]
  evidence: unknown
  corridors: readonly { id: string; end: LatLng; pathEnds?: 'partial' | null }[]
  committedFiles?: ReadonlySet<string>
  mode: 'local' | 'committed'
  run?: { runId: string; geojsonSha256: string; versions: Record<string, string>; routes: Record<string, RunRouteData> }
}): RecordValidation & { mode: string; notVerified: string[] }

export function parsePorcelain(porcelain: string): { status: string; path: string }[]
export function parsePorcelainZ(porcelainZ: string): { status: string; path: string }[]
export function validateCleanTracked(
  snapshot: { trackedFiles: Iterable<string>; porcelain?: string; porcelainZ?: string },
  requiredPaths: readonly string[],
): { clean: boolean; problems: string[] }

export function parseStrictJson(text: string, opts?: { maxDepth?: number }): unknown
export function processRoadPath(rawLonLat: readonly (readonly number[])[]): LatLng[]

export type ExtractedRunRoute = {
  status: string
  warnings: RouteWarning[]
  routeGeometrySha256: string
  snappedEnd: LatLng | null
  rawLonLat: number[][]
  simplifiedPath: LatLng[]
}
export type ExtractedRun = {
  runId: string
  geojsonSha256: string
  versions: Record<string, string>
  routes: Record<string, ExtractedRunRoute>
}
export function extractRunFromGeoJSON(geo: unknown, geojsonHash: string, corridorIds: readonly string[], opts?: { allowedStatuses?: readonly string[] }): {
  run: ExtractedRun | null
  problems: string[]
}

export const CAMPUS: LatLng
export const ROAD_GROUP_SOURCE: string
export const CAMPUS_ACCESS_ROADS: string[]
export const CORRIDORS: CorridorConfig[]
