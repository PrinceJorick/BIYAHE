// Type declarations for scripts/build-routes.mjs (developer-only generator), so tests can import its
// exported helpers directly. Importing the module never starts a run: main() only runs when the file is
// executed with `node`.
import type { LatLng } from '../src/types'
import type { OsrmRequestPolicy, RoutingPolicyParams, VersionSet, WarningThresholds } from '../src/lib/routeVersions'
import type { CorridorConfig, RouteWarning } from '../src/lib/routeChecks'

export const DATA_TARGET: string
export const REPORT_TARGET: string
export const DIAGNOSTIC_TARGET: string
export const DIAGNOSTICS_DIR: string

export const OSRM_SERVER_URLS: Readonly<Record<string, string>>
export function osrmBaseUrl(policy?: OsrmRequestPolicy): string
export const SIMPLIFY_TOLERANCE_M: number
export const DECIMALS: number
export const THRESHOLDS: WarningThresholds
export function versionMetadata(): VersionSet
export function routingPolicyParams(): RoutingPolicyParams

export const STATUS: Readonly<{ failed: 'FAILED'; review: 'NEEDS REVIEW'; candidate: 'CANDIDATE — NOT APPROVED' }>
export const DIAGNOSTIC_MARK: string
export function contentHash(text: string): string

export function coordinatesFor(c: CorridorConfig): LatLng[]
export function bearingsFor(c: CorridorConfig, build?: (count: number, constraints: { index: number; bearingDeg: number; rangeDeg: number }[]) => string | null): string | null
export function buildRequestUrl(c: CorridorConfig, policy?: OsrmRequestPolicy): { url: string; bearings: string | null }

export function makeWarning(code: string, text: string, value: unknown): RouteWarning

/** One analysed corridor. Only the fields the tests rely on are typed precisely. */
export type RouteResult = {
  id: string
  failures: string[]
  flags: string[]
  warnings: RouteWarning[]
  needsReview: string[]
  path?: LatLng[]
  appPath?: LatLng[]
  routeGeometrySha256?: string | null
  rawGeometry?: [number, number][]
  osrmDistanceM?: number
  primaryShare?: number
  [key: string]: unknown
}
export function analyse(c: CorridorConfig, body: unknown, bearings?: string | null): RouteResult
export function statusOf(r: RouteResult): string
/** Qualitative label for the raw primary-road share (inspection aid only, not proof). */
export function roadEvidence(r: { primaryShare?: number | null }): 'unknown' | 'none' | 'weak' | 'substantial'

export type RunMeta = { runId: string; generatedAt: string; osrmDataVersion: string | null; versions?: VersionSet; geojsonSha256?: string }
export function buildDataFile(results: RouteResult[], meta: RunMeta): string
export function buildReport(results: RouteResult[], meta: RunMeta & { versions: VersionSet; geojsonSha256: string }, opts: { kind: 'diagnostic' | 'candidate'; dataHash: string | null }): string
export function buildDiagnosticGeoJSON(results: RouteResult[], meta: RunMeta): {
  type: 'FeatureCollection'
  biyahe: Record<string, unknown> & { runId: string; versions: VersionSet; routingPolicy: RoutingPolicyParams; diagnosticSchemaVersion: 'ds-1' }
  features: { type: 'Feature'; geometry: unknown; properties: Record<string, unknown> }[]
}

/** OSRM-shaped response rebuilt strictly from a ds-1 diagnostic's raw data (throws on any missing/ill-typed field). */
export type RebuiltOsrmBody = {
  code: 'Ok'
  data_version: string | null
  routes: [{
    distance: number
    duration: number | undefined
    geometry: { type: 'LineString'; coordinates: number[][] }
    legs: [{ steps: { name: string | null; ref: string | null; distance: number; maneuver: { type: string } | null; geometry: { type: 'LineString'; coordinates: number[][] } | null }[] }]
  }]
  waypoints: [OsrmWaypoint, OsrmWaypoint]
}
export type OsrmWaypoint = { location: number[]; distance: number; name: string | null }
export function rebuildOsrmBody(geo: unknown, corridorId: string): RebuiltOsrmBody
export function reanalyseFromDiagnostic(geo: unknown, corridor: CorridorConfig): RouteResult
/** Re-analyses one corridor and compares every stored feature with the regenerated one. */
export function verifyDiagnosticRoute(geo: unknown, corridor: CorridorConfig): { result: RouteResult | null; problems: string[] }
export function serializeDiagnosticGeoJSON(results: RouteResult[], meta: RunMeta): { text: string; sha256: string }
export function verifyGeoJsonText(expectedSha256: string): (text: string) => void

export type PromoteEntry = { target: string; text: string; verify?: (text: string) => void }
export function promote(entries: PromoteEntry[], runId: string, opts?: { journalDir?: string; failAt?: string | null }): void
export function writeOutputs(results: RouteResult[], meta: RunMeta, opts?: { promoteFn?: (entries: PromoteEntry[], runId: string) => void }): {
  statuses: string[]
  allCandidate: boolean
  geoTarget: string
  geojsonSha256: string
  meta: RunMeta & { versions: VersionSet; geojsonSha256: string }
}
export function assertNoPositiveClaims(label: string, text: string): void
