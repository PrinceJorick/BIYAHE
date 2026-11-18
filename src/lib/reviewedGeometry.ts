// Fail-closed activation of reviewed road geometry for a campus's corridors. Browser-safe: it imports only
// the shared hashing (routeHash.js) and version (routeVersions.js) modules, never Node APIs, the route
// tools under scripts/, the generator-only route checks or any diagnostic output.
//
// All or nothing: the reviewed paths replace the hand-drawn ones only when the complete set validates,
// with exactly one entry per configured corridor. Anything else (no data, partial or duplicated sets,
// invalid coordinates, wrong hashes, incompatible versions, malformed approval metadata, or any thrown
// error) returns the hand-drawn corridors unchanged: the very same array and objects.
//
// What this runtime check can verify is the internal consistency of the generated roads data: versions,
// route IDs, the campus anchor, each path's geometry hash and the shape of the approval references. It
// cannot read the approval records. The build-time check (scripts/check-reviewed-roads.mjs, run by
// `prebuild`) re-reads the committed records and evidence, re-hashes them and re-runs the full approval
// validation; a set that fails it never reaches a build.
import type { Corridor, LatLng } from '../types'
import { routeGeometryHash, serializeAppPath } from './routeHash.js'
import { incompatibleVersionKeys, VERSIONS, type VersionSet } from './routeVersions.js'

/** Format identifier of the generated roads file (e.g. src/campuses/alangilan.roads.ts). */
export const REVIEWED_ROADS_FORMAT = 'biyahe-reviewed-roads-1'

/** Committed approval file reference: repo path, record hash (CRLF→LF normalized SHA-256) and commit. */
export type ApprovalFileRef = { path: string; recordSha256: string; commitSha: string }

export type ReviewedRoute = {
  routeId: string
  /** Complete application path: the campus anchor first, then the reviewed road path ([lat, lng], 5 dp). */
  path: LatLng[]
  routeGeometrySha256: string
  pathEnds: 'partial' | null
  /** The route's committed human approval record. */
  approval: ApprovalFileRef
}

export type ReviewedRoadSet = {
  format: typeof REVIEWED_ROADS_FORMAT
  campus: string
  campusAnchor: LatLng
  versions: VersionSet
  runId: string
  geojsonSha256: string
  /** The shared campus-exit evidence record the approvals rely on. */
  evidence: ApprovalFileRef
  routes: ReviewedRoute[]
}

export type ActivationContext = { campusId: string; anchor: LatLng }
export type Activation = { corridors: Corridor[]; active: boolean; problems: string[] }

// Repository paths of the approval files. Must equal APPROVALS_DIR / EVIDENCE_PATH in
// scripts/approve-routes.mjs (asserted by the tests; the app cannot import scripts/).
export const approvalRecordPath = (campusId: string, routeId: string) => `docs/routes/approvals/${campusId}/${routeId}.json`
export const evidenceRecordPath = (campusId: string) => `docs/routes/approvals/evidence/${campusId}-campus-exit.json`

const SET_FIELDS = ['format', 'campus', 'campusAnchor', 'versions', 'runId', 'geojsonSha256', 'evidence', 'routes']
const ROUTE_FIELDS = ['routeId', 'path', 'routeGeometrySha256', 'pathEnds', 'approval']
const REF_FIELDS = ['path', 'recordSha256', 'commitSha']

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isHash = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
const isCommit = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v)
const isLatLng = (v: unknown): v is LatLng =>
  Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) && Math.abs(v[0]) <= 90 && Math.abs(v[1]) <= 180
const unknownKeys = (o: Record<string, unknown>, allowed: string[]) => Object.keys(o).filter((k) => !allowed.includes(k))

function checkRef(ref: unknown, expectedPath: string, where: string, problems: string[]) {
  if (!isObject(ref)) { problems.push(`${where}: approval reference is missing`); return }
  for (const k of unknownKeys(ref, REF_FIELDS)) problems.push(`${where}: unknown field ${k}`)
  if (ref.path !== expectedPath) problems.push(`${where}: path must be ${expectedPath}`)
  if (!isHash(ref.recordSha256)) problems.push(`${where}: recordSha256 must be a SHA-256 hex digest`)
  if (!isCommit(ref.commitSha)) problems.push(`${where}: commitSha must be a full 40-character commit SHA`)
}

/**
 * Validates a reviewed road set against the campus. Returns the problems found (empty = consistent).
 * `routeIds` are the campus's configured corridor IDs; the set must contain each exactly once.
 */
export function validateReviewedRoadSet(roads: unknown, ctx: ActivationContext & { routeIds: readonly string[] }): string[] {
  const problems: string[] = []
  if (!isObject(roads)) return ['reviewed road data is not an object']
  for (const k of unknownKeys(roads, SET_FIELDS)) problems.push(`unknown field ${k}`)
  if (roads.format !== REVIEWED_ROADS_FORMAT) problems.push(`format must be ${REVIEWED_ROADS_FORMAT}`)
  if (roads.campus !== ctx.campusId) problems.push(`campus must be ${ctx.campusId}`)
  const anchorOk = isLatLng(ctx.anchor) && isLatLng(roads.campusAnchor)
    && roads.campusAnchor[0] === ctx.anchor[0] && roads.campusAnchor[1] === ctx.anchor[1]
  if (!anchorOk) problems.push('campusAnchor must equal the campus location exactly')

  const versions = roads.versions
  if (!isObject(versions)) problems.push('versions are missing')
  else {
    const expected = Object.keys(VERSIONS)
    for (const k of unknownKeys(versions, expected)) problems.push(`versions: unknown field ${k}`)
    for (const k of expected) if (typeof versions[k] !== 'string' || versions[k] === '') problems.push(`versions: ${k} is missing`)
    const bad = incompatibleVersionKeys(versions as Partial<VersionSet>, VERSIONS)
    if (bad.length) problems.push(`incompatible versions: ${bad.join(', ')}`)
  }
  if (typeof roads.runId !== 'string' || !/^[A-Za-z0-9-]+$/.test(roads.runId)) problems.push('runId is missing or malformed')
  if (!isHash(roads.geojsonSha256)) problems.push('geojsonSha256 must be a SHA-256 hex digest')
  checkRef(roads.evidence, evidenceRecordPath(ctx.campusId), 'evidence', problems)

  const routes = roads.routes
  if (!Array.isArray(routes)) return [...problems, 'routes must be an array']
  if (routes.length !== ctx.routeIds.length) problems.push(`routes must contain exactly ${ctx.routeIds.length} entries (found ${routes.length})`)
  const seen = new Set<string>()
  routes.forEach((r: unknown, i) => {
    const where = `routes[${i}]`
    if (!isObject(r)) { problems.push(`${where}: not an object`); return }
    for (const k of unknownKeys(r, ROUTE_FIELDS)) problems.push(`${where}: unknown field ${k}`)
    const id = r.routeId
    if (typeof id !== 'string' || !ctx.routeIds.includes(id)) { problems.push(`${where}: unknown route ${JSON.stringify(id)}`); return }
    if (seen.has(id)) problems.push(`${where}: duplicate route ${id}`)
    seen.add(id)
    if (r.pathEnds !== null && r.pathEnds !== 'partial') problems.push(`${id}: pathEnds must be "partial" or null`)
    let serializedOk = false
    try {
      if (!Array.isArray(r.path)) throw new TypeError('path must be an array')
      serializeAppPath(r.path as LatLng[], ctx.anchor)
      serializedOk = true
    } catch (e) {
      problems.push(`${id}: invalid path: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (!isHash(r.routeGeometrySha256)) problems.push(`${id}: routeGeometrySha256 must be a SHA-256 hex digest`)
    else if (serializedOk && routeGeometryHash(r.path as LatLng[], ctx.anchor) !== r.routeGeometrySha256) {
      problems.push(`${id}: routeGeometrySha256 does not match the path`)
    }
    checkRef(r.approval, approvalRecordPath(ctx.campusId, id), `${id} approval`, problems)
  })
  for (const id of ctx.routeIds) if (!seen.has(id)) problems.push(`route ${id} is missing`)
  return problems
}

/**
 * Returns the corridors the app should use. Without valid, complete reviewed data this is `handDrawn`
 * itself (same array, same objects). With it, every corridor gets its reviewed path; nothing else changes.
 */
export function activateReviewedGeometry(handDrawn: Corridor[], roads: ReviewedRoadSet | null | undefined, ctx: ActivationContext): Activation {
  if (roads === null || roads === undefined) return { corridors: handDrawn, active: false, problems: [] }
  try {
    const routeIds = handDrawn.map((c) => c.id)
    const problems = validateReviewedRoadSet(roads, { ...ctx, routeIds })
    if (new Set(routeIds).size !== routeIds.length) problems.push('the hand-drawn corridors contain duplicate IDs')
    if (problems.length) return { corridors: handDrawn, active: false, problems }
    const byId = new Map(roads.routes.map((r) => [r.routeId, r]))
    const corridors = handDrawn.map((c) => ({ ...c, path: byId.get(c.id)!.path.map((p): LatLng => [p[0], p[1]]) }))
    return { corridors, active: true, problems: [] }
  } catch (e) {
    return { corridors: handDrawn, active: false, problems: [`validation error: ${e instanceof Error ? e.message : String(e)}`] }
  }
}
