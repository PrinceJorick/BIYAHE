// Build-time integrity check for reviewed road data (developer-only; never imported by the app).
// Run by `prebuild` through src/campuses/roads.test.ts, so `npm run build` fails on invalid road data.
//
// A null roads file (no reviewed set yet) passes: the app keeps its hand-drawn routes. A non-null set
// passes only if ALL of these hold:
//   1. The runtime check (validateReviewedRoadSet: format, campus, anchor, versions, exactly one entry per
//      configured corridor, valid coordinates, geometry hashes, approval reference shape) finds nothing.
//   2. The configured corridors agree: each route's pathEnds equals its CORRIDORS entry, and its final
//      point is the endpoint the approval accepts (within 1 m of an accepted endpoint relationship, or within
//      the endpoint-snap review distance of the configured endpoint when no endpoint warning was resolved).
//   3. Provenance: the five route records and the shared evidence file exist, nothing else is in the
//      records folder, and each file's record hash (CRLF→LF normalized SHA-256) equals the hash recorded in
//      the roads data — an approval file edited after generation fails. Records are parsed strictly.
//   4. The full approval validation (validateApprovalSet, committed-records mode) passes with no blockers,
//      including the shared evidence and its references, and every record matches the roads data (run,
//      GeoJSON hash, versions, geometry hash, pathEnds).
// Limits: commit state is not re-checked here (no Git at build time); `npm run routes:approve` checks it
// before the roads file is generated, and the recorded commit SHAs identify those commits.
import type { LatLng } from '../src/types'
import { haversineM } from '../src/lib/geo'
import { validateReviewedRoadSet, type ReviewedRoadSet } from '../src/lib/reviewedGeometry'
import { CAMPUS, CORRIDORS, parseStrictJson, recordSha256, validateApprovalSet, type ApprovalRecord, type CorridorConfig } from '../src/lib/routeChecks'
import { VERSIONS, WARNING_SCHEMA_PARAMS } from '../src/lib/routeVersions'
import { APPROVALS_DIR, EVIDENCE_PATH, recordPath } from './approve-routes.mjs'

const ENDPOINT_TOLERANCE_M = 1

export type BuildCheckInput = {
  roads: ReviewedRoadSet | null
  /** Text of a repository file, or null if it does not exist. */
  readText: (path: string) => string | null
  /** Repository-relative paths of the files present (used for evidence references and the records folder). */
  knownFiles: ReadonlySet<string>
  corridors?: readonly CorridorConfig[]
  campus?: LatLng
}
export type BuildCheckResult = { ok: boolean; active: boolean; problems: string[] }

export function validateReviewedRoadsForBuild({ roads, readText, knownFiles, corridors = CORRIDORS, campus = CAMPUS }: BuildCheckInput): BuildCheckResult {
  if (roads === null) return { ok: true, active: false, problems: [] }
  const problems: string[] = []
  try {
    // 1. Runtime consistency checks (the same function the app uses).
    problems.push(...validateReviewedRoadSet(roads, { campusId: 'alangilan', anchor: campus, routeIds: corridors.map((c) => c.id) }))
    if (problems.length) return { ok: false, active: false, problems }

    // 3. Provenance: exact files, recorded hashes, strict JSON.
    const listed = [...knownFiles].filter((p) => p.startsWith(`${APPROVALS_DIR}/`))
    for (const p of listed) if (!corridors.some((c) => recordPath(c.id) === p)) problems.push(`unexpected file in ${APPROVALS_DIR}: ${p}`)
    const load = (path: string, recorded: string): unknown => {
      const text = readText(path)
      if (text === null) { problems.push(`${path} is missing`); return undefined }
      let hash: string
      try { hash = recordSha256(text) } catch (e) { problems.push(`${path}: ${(e as Error).message}`); return undefined }
      if (hash !== recorded) { problems.push(`${path} has changed since the road data was generated (record hash ${hash}, recorded ${recorded})`); return undefined }
      try { return parseStrictJson(text.replace(/\r\n/g, '\n')) } catch (e) { problems.push(`${path}: ${(e as Error).message}`); return undefined }
    }
    if (roads.evidence.path !== EVIDENCE_PATH) problems.push(`evidence path must be ${EVIDENCE_PATH}`)
    const evidence = load(roads.evidence.path, roads.evidence.recordSha256)
    const records: ApprovalRecord[] = []
    for (const c of corridors) {
      const route = roads.routes.find((r) => r.routeId === c.id)!
      if (route.approval.path !== recordPath(c.id)) problems.push(`${c.id}: approval path must be ${recordPath(c.id)}`)
      const rec = load(route.approval.path, route.approval.recordSha256) as ApprovalRecord | undefined
      if (!rec) continue
      records.push(rec)
      // 4b. The record must describe exactly this road data.
      const where = `${c.id} record`
      if (rec.routeId !== c.id) problems.push(`${where}: routeId ${JSON.stringify(rec.routeId)} does not match`)
      if (rec.runId !== roads.runId) problems.push(`${where}: runId does not match the road data`)
      if (rec.geojsonSha256 !== roads.geojsonSha256) problems.push(`${where}: geojsonSha256 does not match the road data`)
      if (rec.routeGeometrySha256 !== route.routeGeometrySha256) problems.push(`${where}: routeGeometrySha256 does not match the road path`)
      if (rec.pathEnds !== route.pathEnds) problems.push(`${where}: pathEnds does not match the road data`)
      for (const k of Object.keys(VERSIONS) as (keyof typeof VERSIONS)[]) {
        if (rec[k] !== roads.versions[k]) problems.push(`${where}: ${k} does not match the road data`)
      }
      // 2. Configured corridor and endpoint.
      if (route.pathEnds !== c.pathEnds) problems.push(`${c.id}: pathEnds must be ${JSON.stringify(c.pathEnds)} (configured corridor)`)
      const last = route.path[route.path.length - 1]
      const accepted = (Array.isArray(rec.resolutions) ? rec.resolutions : []).map((r) => r?.endpointRelationship?.acceptedEndpoint).filter(Boolean) as LatLng[]
      if (accepted.length) {
        for (const a of accepted) if (!(haversineM(last, a) <= ENDPOINT_TOLERANCE_M)) problems.push(`${c.id}: the path does not end at the accepted endpoint`)
      } else if (!(haversineM(last, c.end) <= WARNING_SCHEMA_PARAMS.thresholds.endpointSnapReviewM)) {
        problems.push(`${c.id}: the path ends ${Math.round(haversineM(last, c.end))} m from the configured endpoint without an accepted endpoint relationship`)
      }
    }

    // 4. Full approval validation of the committed records and evidence.
    if (evidence !== undefined && records.length === corridors.length) {
      const set = validateApprovalSet({ records, evidence, corridors, committedFiles: knownFiles, mode: 'committed' })
      problems.push(...set.problems, ...set.blockers.map((b) => `blocker: ${b}`))
      if (!set.activatable) problems.push('the approval set is not activatable')
    }
  } catch (e) {
    problems.push(`validation error: ${(e as Error).message}`)
  }
  const unique = [...new Set(problems)]
  return { ok: unique.length === 0, active: unique.length === 0, problems: unique }
}
