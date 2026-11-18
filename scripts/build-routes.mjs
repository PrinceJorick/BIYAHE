#!/usr/bin/env node
// BIYAHE route generator — DEVELOPER-ONLY. Run only with:  npm run routes:alangilan
// (the npm script runs the route-check unit tests first; this script refuses to run otherwise).
//
// Fetches road-following geometry for the five Alangilan corridors from the public OSRM demo server
// and validates it. Outputs:
//   Always, once any corridor has been requested (staged and promoted together):
//     docs/routes/alangilan-diagnostic.md
//     docs/routes/diagnostics/alangilan-candidates.DIAGNOSTIC.<runId>.geojson   (git-ignored)
//   Only when ALL five corridors are "CANDIDATE — NOT APPROVED" (no failure, no unresolved warning):
//     src/campuses/alangilan.routes.ts   candidate data, approved: false, not used by the app
//     docs/routes/alangilan-report.md    paired report (runId + SHA-256)
// While any corridor is FAILED or NEEDS REVIEW the candidate files are not created or replaced.
//
// Rules: never imported by the app (src/lib/isolation.test.ts); requests sequential and >= 1.1 s
// apart (OSRM demo server policy: https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server);
// no retries, no fallback geometry, no invented or moved via-points; staged writes with rollback;
// every output passes the positive-claim wording guard before anything is staged.
//
// Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright

import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  haversineM, isValidLatLng, maxSegmentM, osrmToLatLng, pathLengthM, roundLatLng,
  withinAlangilanRoutingBounds,
} from '../src/lib/geo.js'
import {
  buildAppPath, buildBearingsParam, classifyOvershoot, classifySnappedEndLoop, computeZoneExcess, detectCampusExit,
  finalApproach, findPositiveClaims, geojsonSha256, localFrame, matchPrimaryRoads, nearStraight, normalizeRoadName,
  processRoadPath, recordSha256, routeGeometryHash, validateApproach, validateWarningList,
} from '../src/lib/routeChecks.js'
import {
  deriveRoutingPolicyParams, DIAG_SCHEMA_VERSION, GEOMETRY_PROCESSING_PARAMS, OSRM_REQUEST_POLICY, VERSIONS,
  WARNING_SCHEMA_PARAMS,
} from '../src/lib/routeVersions.js'
import { CAMPUS, CAMPUS_ACCESS_ROADS, CORRIDORS, ROAD_GROUP_SOURCE } from './routes.config.mjs'

// ── Settings ────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_TARGET = join(ROOT, 'src', 'campuses', 'alangilan.routes.ts')
export const REPORT_TARGET = join(ROOT, 'docs', 'routes', 'alangilan-report.md')
export const DIAGNOSTIC_TARGET = join(ROOT, 'docs', 'routes', 'alangilan-diagnostic.md')
export const DIAGNOSTICS_DIR = join(ROOT, 'docs', 'routes', 'diagnostics')
const JOURNAL_DIR = join(ROOT, 'scripts')
const diagnosticGeoJsonTarget = (runId) => join(DIAGNOSTICS_DIR, `alangilan-candidates.DIAGNOSTIC.${runId}.geojson`)

// OSRM server identifier (from the shared routing policy) → URL. The URL lives only here, in this
// developer-only script, because the shared policy module is importable by the app. Changing this URL
// is a routing-policy change: bump ROUTING_POLICY_VERSION (routeVersions.test.ts pins it).
export const OSRM_SERVER_URLS = Object.freeze({ 'osrm-public-demo-server': 'https://router.project-osrm.org' })
export function osrmBaseUrl(policy = OSRM_REQUEST_POLICY) {
  const url = OSRM_SERVER_URLS[policy.server]
  if (!url) throw new Error(`No URL configured for OSRM server "${policy.server}"`)
  return url
}
const OSRM_BASE = osrmBaseUrl()
const PROFILE = OSRM_REQUEST_POLICY.profile
const USER_AGENT = 'BIYAHE-route-generator (developer script)'
const MIN_REQUEST_GAP_MS = 1100
const REQUEST_TIMEOUT_MS = 15_000

// Geometry processing and warning thresholds come from the shared, version-pinned schemas.
export const SIMPLIFY_TOLERANCE_M = GEOMETRY_PROCESSING_PARAMS.simplification.toleranceM
export const DECIMALS = GEOMETRY_PROCESSING_PARAMS.precision.decimals
export const THRESHOLDS = WARNING_SCHEMA_PARAMS.thresholds
const LENGTH_TOLERANCE = THRESHOLDS.lengthToleranceRatio // raw geometry length vs OSRM distance
const CONNECTOR_REVIEW_M = THRESHOLDS.connectorReviewM // campus LOCATION → first road point
const START_SNAP_REVIEW_M = THRESHOLDS.startSnapReviewM
const END_SNAP_REVIEW_M = THRESHOLDS.endpointSnapReviewM
const MAX_SEGMENT_GUARD_M = THRESHOLDS.maxSegmentGuardM // gross-glitch guard only; not a road-following test
const WEAK_ROAD_SHARE = THRESHOLDS.weakRoadShareBelow // primary-road share below this → review warning (inspection aid only)
const FINAL_APPROACH_M = THRESHOLDS.finalApproachM
const ENDPOINT_ZONE_M = THRESHOLDS.endpointZoneM
const NEAR_STRAIGHT_MIN_M = THRESHOLDS.nearStraightMinStraightM
const NEAR_STRAIGHT_RATIO = THRESHOLDS.nearStraightMaxRatio

// Version identifiers carried by every diagnostic report, GeoJSON and candidate data file of a run.
export const versionMetadata = () => ({ ...VERSIONS })
// Routing-policy parameters this generator runs with (pinned per ROUTING_POLICY_VERSION in tests).
export const routingPolicyParams = () => deriveRoutingPolicyParams(CAMPUS, CORRIDORS)

// Automated statuses. Each one is not verified, not confirmed, not approved and not production-ready.
export const STATUS = Object.freeze({
  failed: 'FAILED',
  review: 'NEEDS REVIEW',
  candidate: 'CANDIDATE — NOT APPROVED',
})
export const DIAGNOSTIC_MARK = 'DIAGNOSTIC — NOT APPROVED'
const STATUS_LEGEND = `Statuses: **${STATUS.failed}** = blocking validation failure. **${STATUS.review}** = no failure, but at least one unresolved human-review warning. **${STATUS.candidate}** = no failure and no unresolved warning; the route is still not approved and not cleared for the app. Every route in this file is not verified, not confirmed, not approved and not production-ready; only a recorded human approval in Phase 2 can change that.`

// ── Small utilities ─────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const m = (n) => (n == null ? '—' : `${Math.round(n).toLocaleString('en-US')} m`)
const km = (n) => (n == null ? '—' : `${(n / 1000).toFixed(2)} km`)
const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`)
const fmtPt = (p) => (p ? `${p[0]}, ${p[1]}` : '—')
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10)
// Candidate-data hash for the paired report: the shared record hash (CRLF → LF, so a CRLF checkout
// gives the same value; byte-order marks and lone CRs rejected).
export const contentHash = (text) => recordSha256(text)

function checkInvocation() {
  if (process.env.npm_lifecycle_event !== 'routes:alangilan') {
    console.error('Run this generator only with `npm run routes:alangilan`, which runs the route-check tests first.')
    process.exit(1)
  }
}

function checkRuntime() {
  if (typeof fetch !== 'function' || typeof AbortSignal?.timeout !== 'function') {
    console.error(`This script needs global fetch and AbortSignal.timeout (Node >= 18). Found Node ${process.version}.`)
    process.exit(1)
  }
}

const VIA_FIELDS = ['lat', 'lon', 'osmWayId', 'osmRoadName', 'source', 'reason', 'addedBy', 'addedOn']

function checkProvenance() {
  const problems = []
  for (const c of CORRIDORS) {
    c.vias.forEach((v, i) => {
      const missing = VIA_FIELDS.filter((f) => !(f in v) || v[f] === undefined || (f !== 'osmWayId' && f !== 'osmRoadName' && (v[f] === null || v[f] === '')))
      if (missing.length) problems.push(`${c.id} via #${i + 1}: missing ${missing.join(', ')}`)
      else if (!withinAlangilanRoutingBounds([v.lat, v.lon])) problems.push(`${c.id} via #${i + 1}: [lat, lon] outside the routing bounds`)
    })
    if (c.approach) {
      for (const p of validateApproach(c.approach)) problems.push(`${c.id} approach: ${p}`)
    }
    // Throws on an invalid bearing or a wrong entry count.
    try { bearingsFor(c) } catch (e) { problems.push(`${c.id} bearings: ${e.message}`) }
  }
  if (problems.length) {
    console.error('Refusing to run: provenance or bearing checks failed.\n  ' + problems.join('\n  '))
    process.exit(1)
  }
}

// Leftovers from an interrupted run must be dealt with by a human before anything is overwritten.
function checkLeftovers() {
  const dirs = [dirname(DATA_TARGET), dirname(REPORT_TARGET), dirname(DIAGNOSTIC_TARGET), DIAGNOSTICS_DIR, JOURNAL_DIR]
  const found = []
  for (const d of new Set(dirs)) {
    if (!existsSync(d)) continue
    for (const name of readdirSync(d)) {
      if (/\.staged$|\.bak$/.test(name) || /^\.build-routes\..+\.journal\.json$/.test(name)) found.push(join(d, name))
    }
  }
  if (found.length) {
    console.error([
      'Refusing to run: files from an interrupted run were found:',
      ...found.map((f) => '  ' + relative(ROOT, f)),
      'If a journal is listed, read it: for each entry with backedUp=true, the .bak file is the previous',
      'file. Restore it by renaming it back to its target (delete a promoted target first), then delete the',
      '.staged files and the journal. Re-run the script afterwards.',
    ].join('\n'))
    process.exit(1)
  }
}

// ── OSRM ────────────────────────────────────────────────────────────────────

class Failure extends Error {
  constructor(kind, message) { super(message); this.kind = kind }
}

// Request coordinates in order: campus, via-points, requested destination ([lat, lng]).
export const coordinatesFor = (c) => [CAMPUS, ...c.vias.map((v) => [v.lat, v.lon]), c.end]

// One bearings entry per coordinate; only the destination of a corridor with `approach` is constrained.
export function bearingsFor(c, build = buildBearingsParam) {
  const count = coordinatesFor(c).length
  const constraints = c.approach ? [{ index: count - 1, bearingDeg: c.approach.bearingDeg, rangeDeg: c.approach.rangeDeg }] : []
  const param = build(count, constraints)
  if (param !== null && param.split(';').length !== count) throw new Error(`bearings has ${param.split(';').length} entries for ${count} coordinates`)
  return param
}

// The exact OSRM request for a corridor, built from the shared routing policy:
//   <server URL>/<service>/<api version>/<profile>/<lon,lat;…>?<policy query>[&bearings=…]
// OSRM wants lon,lat — converted explicitly from our [lat, lng]. `bearings` is omitted when unconstrained.
export function buildRequestUrl(c, policy = OSRM_REQUEST_POLICY) {
  const coords = coordinatesFor(c).map(([lat, lng]) => `${lng},${lat}`).join(';')
  const bearings = bearingsFor(c)
  const query = Object.entries(policy.query).map(([k, v]) => `${k}=${v}`).join('&')
  const url = `${osrmBaseUrl(policy)}/${policy.service}/${policy.apiVersion}/${policy.profile}/${coords}?${query}${bearings ? `&bearings=${bearings}` : ''}`
  return { url, bearings }
}

let lastRequestAt = 0

async function fetchRoute(c) {
  const wait = lastRequestAt + MIN_REQUEST_GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()

  const { url, bearings } = buildRequestUrl(c)

  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (e) {
    throw new Failure('network', `Request failed: ${e?.name === 'TimeoutError' ? `timed out after ${REQUEST_TIMEOUT_MS} ms` : e?.message ?? e}`)
  }
  const text = await res.text()
  if (!res.ok) throw new Failure('http', `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`)
  let body
  try { body = JSON.parse(text) } catch { throw new Failure('json', `Response is not JSON: ${text.slice(0, 300)}`) }
  if (body?.code !== 'Ok') throw new Failure('osrm', `OSRM returned code ${body?.code ?? '(none)'}: ${body?.message ?? '(no message)'}`)
  if (!Array.isArray(body.routes) || body.routes.length === 0) throw new Failure('osrm', 'OSRM returned no routes')
  return { body, bearings }
}

// ── Analysis ────────────────────────────────────────────────────────────────

const baseResult = (c) => ({
  id: c.id, appViaLabel: c.appViaLabel, destination: c.destination, originalEnd: c.end, vias: c.vias,
  approach: c.approach ?? null, pathEnds: c.pathEnds ?? null, primaryRoads: c.primaryRoads,
  failures: [], flags: [], warnings: [], needsReview: [],
})

const round3 = (n) => Math.round(n * 1000) / 1000

// A structured warning { code, text, value } (warning schema). The text is also kept in `flags` for the
// human-readable report. The list is validated against the shared warning schema at the end of analyse().
export function makeWarning(code, text, value) {
  return { code, text, value }
}

// Returns everything that could be measured, plus failures (blocking) and structured warnings.
export function analyse(c, body, bearings = null) {
  const r = { ...baseResult(c), bearingsParam: bearings }
  const warn = (code, text, value) => { r.warnings.push(makeWarning(code, text, value)); r.flags.push(text) }
  const route = body.routes[0]
  r.osrmDataVersion = body.data_version ?? null

  const coords = route?.geometry?.coordinates
  if (route?.geometry?.type !== 'LineString' || !Array.isArray(coords) || coords.length < 2) {
    r.failures.push('Geometry is not a LineString with at least 2 positions')
    return r
  }
  let raw
  try { raw = coords.map(osrmToLatLng) } catch (e) { r.failures.push(`Malformed geometry: ${e.message}`); return r }
  const invalid = raw.findIndex((p) => !isValidLatLng(p))
  if (invalid !== -1) { r.failures.push(`Invalid coordinate at index ${invalid}: ${JSON.stringify(coords[invalid])}`); return r }
  // Kept exactly as OSRM returned it ([lon, lat]) for the diagnostic GeoJSON only.
  r.rawGeometry = coords.map((p) => [p[0], p[1]])
  const outside = raw.findIndex((p) => !withinAlangilanRoutingBounds(p))
  if (outside !== -1) r.failures.push(`Coordinate outside the routing bounds at index ${outside}: [lat, lng] ${fmtPt(raw[outside])}`)

  r.rawPointCount = raw.length
  r.rawLengthM = pathLengthM(raw)
  r.osrmDistanceM = route.distance
  r.osrmDurationS = route.duration
  if (!Number.isFinite(route.distance) || route.distance <= 0) r.failures.push(`OSRM distance is not a positive number: ${route.distance}`)
  else {
    r.lengthDelta = Math.abs(r.rawLengthM - route.distance) / route.distance
    if (r.lengthDelta > LENGTH_TOLERANCE) r.failures.push(`Geometry length ${m(r.rawLengthM)} differs from OSRM distance ${m(route.distance)} by ${pct(r.lengthDelta)} (> ${pct(LENGTH_TOLERANCE)})`)
  }

  // Shared gp-1 processing (convert → simplify → round → remove consecutive duplicates), also used by the
  // approval script to reproduce this path from the raw geometry.
  r.path = processRoadPath(coords)
  r.pathLengthM = pathLengthM(r.path)
  r.maxSegmentM = maxSegmentM(r.path)
  if (r.maxSegmentM > MAX_SEGMENT_GUARD_M) r.failures.push(`A segment of ${m(r.maxSegmentM)} exceeds the ${m(MAX_SEGMENT_GUARD_M)} glitch guard`)

  // Geometry hash of the complete application path [campus, ...road path] (shared serialization).
  try {
    r.appPath = buildAppPath(CAMPUS, r.path)
    r.routeGeometrySha256 = routeGeometryHash(r.appPath, CAMPUS)
  } catch (e) {
    r.routeGeometrySha256 = null
    r.failures.push(`Application path cannot be serialized for hashing: ${e.message}`)
  }

  // Endpoint snapping (OSRM waypoints) and the campus connector.
  const wps = Array.isArray(body.waypoints) ? body.waypoints : []
  const first = wps[0]
  const last = wps[wps.length - 1]
  if (!first || !last) r.failures.push('OSRM returned no waypoints')
  else {
    // Exact OSRM waypoint data, kept verbatim for the diagnostic (ds-1) so the analysis can be re-run.
    r.startWaypointRaw = { location: [...first.location], name: typeof first.name === 'string' ? first.name : null }
    r.endWaypointRaw = { location: [...last.location], name: typeof last.name === 'string' ? last.name : null }
    r.snappedEndExact = osrmToLatLng(last.location)
    r.snappedStart = roundLatLng(osrmToLatLng(first.location), DECIMALS)
    r.snappedEnd = roundLatLng(r.snappedEndExact, DECIMALS)
    r.startSnapM = first.distance
    r.endSnapM = last.distance
    r.startSnapRoad = first.name || '(unnamed)'
    r.endSnapRoad = last.name || '(unnamed)'
    if (r.startSnapM > START_SNAP_REVIEW_M) warn('start-snap', `start snap ${m(r.startSnapM)} > ${m(START_SNAP_REVIEW_M)}`, r1(r.startSnapM))
    if (r.endSnapM > END_SNAP_REVIEW_M) warn('endpoint-snap', `endpoint snap ${m(r.endSnapM)} > ${m(END_SNAP_REVIEW_M)}: the snapped destination needs human review`, r1(r.endSnapM))
    r.endMovedM = haversineM(c.end, r.snappedEnd)
  }
  r.connectorM = haversineM(CAMPUS, r.path[0])
  if (r.connectorM > CONNECTOR_REVIEW_M) warn('connector-long', `connector ${m(r.connectorM)} > ${m(CONNECTOR_REVIEW_M)}`, r1(r.connectorM))

  // Near-straight: straight-line >= 500 m and route length / straight-line < 1.02.
  r.nearStraight = nearStraight(r.path)
  if (r.nearStraight.warn) {
    warn('near-straight', `near-straight route (ratio ${r.nearStraight.ratio.toFixed(3)} < ${NEAR_STRAIGHT_RATIO} over ${m(r.nearStraight.straightM)})`, round3(r.nearStraight.ratio))
  }

  // Steps: names and refs as returned. Primary-road matching uses names only.
  const steps = (route.legs ?? []).flatMap((l) => l.steps ?? [])
  const roads = new Map()
  let unnamedM = 0
  r.steps = []
  for (const s of steps) {
    const name = (s.name ?? '').trim()
    const ref = (s.ref ?? '').trim()
    const d = Number.isFinite(s.distance) ? s.distance : 0
    const key = `${name}\u0000${ref}`
    const row = roads.get(key) ?? { name: name || null, ref: ref || null, distanceM: 0 }
    row.distanceM += d
    roads.set(key, row)
    if (!name && !ref) unnamedM += d
    const g = s.geometry
    const stepCoords = g?.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2
      && g.coordinates.every((p) => Array.isArray(p) && isValidLatLng([p[1], p[0]]))
      ? g.coordinates.map((p) => [p[0], p[1]]) : null
    r.steps.push({ name: name || null, ref: ref || null, distanceM: d, maneuver: s.maneuver?.type ?? null, coordinates: stepCoords })
  }
  r.roads = [...roads.values()].filter((x) => x.distanceM > 0).sort((a, b) => b.distanceM - a.distanceM)
  r.unnamedM = unnamedM
  const match = matchPrimaryRoads(r.steps, c.primaryRoads, route.distance)
  r.primaryMatchedM = match.matchedM
  r.primaryShare = match.share
  r.perRoad = match.perRoad
  const primaryKeys = new Set(c.primaryRoads.map((p) => normalizeRoadName(p.name)))
  for (const s of r.steps) s.matchesPrimaryRoad = Boolean(s.name) && primaryKeys.has(normalizeRoadName(s.name))
  if (steps.length === 0) r.failures.push('OSRM returned no steps, so road names cannot be checked')
  else if (match.matchedM === 0) r.failures.push(`Primary-road share is 0: no step name matches ${c.primaryRoads.map((p) => `"${p.label}"`).join(', ')}`)
  else if (match.share < WEAK_ROAD_SHARE) {
    warn('weak-road-evidence', `weak road-name evidence: ${pct(match.share)} of route on primary-road names (< ${pct(WEAK_ROAD_SHARE)})`, round3(match.share))
  }

  // Primary destination overshoot, against the ORIGINAL requested destination.
  r.overshoot = computeZoneExcess(raw, c.end, ENDPOINT_ZONE_M)
  r.overshootClass = classifyOvershoot(r.overshoot.excessM)
  if (r.overshootClass === 'fail') r.failures.push(`Destination overshoot ${m(r.overshoot.excessM)} > ${m(THRESHOLDS.destinationOvershootFailM)} after entering the ${ENDPOINT_ZONE_M} m zone around the requested destination`)
  else if (r.overshootClass === 'review') {
    warn('destination-overshoot', `destination overshoot ${m(r.overshoot.excessM)} > ${m(THRESHOLDS.destinationOvershootReviewM)} after entering the ${ENDPOINT_ZONE_M} m zone around the requested destination`, r1(r.overshoot.excessM))
  } else if (r.overshootClass === 'not-measurable') {
    warn('endpoint-zone-not-reached', `endpoint-zone-not-reached: the route never enters the ${ENDPOINT_ZONE_M} m zone around the requested destination, so destination overshoot is not measurable`, ENDPOINT_ZONE_M)
  }

  // Auxiliary snapped-endpoint loop measure (San Jose only). It can add a review warning; it never
  // replaces the primary measure, never clears a warning and never causes FAILED on its own.
  r.snappedEndLoop = null
  if (c.auxSnappedEndExcess && r.snappedEndExact) {
    const aux = computeZoneExcess(raw, r.snappedEndExact, ENDPOINT_ZONE_M)
    r.snappedEndLoop = { ...aux, classification: classifySnappedEndLoop(aux.excessM) }
    if (r.snappedEndLoop.classification === 'review') {
      warn('snapped-endpoint-loop', `snapped-endpoint-loop: ${m(aux.excessM)} > ${m(THRESHOLDS.snappedEndpointLoopReviewM)} of extra travel after entering the ${ENDPOINT_ZONE_M} m zone around the snapped destination`, r1(aux.excessM))
    }
  }

  // Actual final approach direction from the final 150 m of geometry.
  r.finalApproach = finalApproach(raw, FINAL_APPROACH_M)
  r.finalStep = [...r.steps].reverse().find((s) => s.distanceM > 0) ?? null
  if (c.approach) {
    warn('snap-bearing-applied', `destination snap bearing constraint applied (${c.approach.bearingDeg}° ± ${c.approach.rangeDeg}°): it does not guarantee the final approach direction; verify the approach visually`,
      { bearingDeg: c.approach.bearingDeg, rangeDeg: c.approach.rangeDeg })
  }

  // Shared campus exit: unresolved until on-site verification. Unnamed segments are named "(unnamed)"
  // in the warning value, the same form the shared evidence must use in segmentsInspected.
  r.campusExit = detectCampusExit(r.steps, CAMPUS_ACCESS_ROADS, c.primaryRoads)
  if (r.campusExit.usesAccessRoads) {
    const names = r.campusExit.steps.map((s) => s.name ?? '(unnamed)')
    warn('campus-exit-unverified', `campus exit unresolved: ${m(r.campusExit.distanceM)} via ${names.join(' → ')}; public access and actual usability require on-site verification`,
      { distanceM: r1(r.campusExit.distanceM), roads: [...new Set(names)] })
  }

  // Every warning must satisfy the shared warning schema; a mismatch is a generator bug, not a route issue.
  const problems = validateWarningList(r.warnings, `${c.id} warnings`)
  if (problems.length) throw new Error(`Generator produced invalid warnings:\n  ${problems.join('\n  ')}`)

  r.needsReview = r.flags.slice()
  return r
}

export function statusOf(r) {
  if (r.fetchError || r.failures.length) return STATUS.failed
  if (r.needsReview?.length) return STATUS.review
  return STATUS.candidate
}

// Qualitative label for the raw primary-road share. Inspection aid only, not proof.
export function roadEvidence(r) {
  if (r.primaryShare == null) return 'unknown'
  if (r.primaryShare === 0) return 'none'
  return r.primaryShare < WEAK_ROAD_SHARE ? 'weak' : 'substantial'
}

const overshootText = (o) => (o.measurable ? `${m(o.excessM)} (remaining ${m(o.remainingM)} − direct ${m(o.directM)})` : 'not measurable — endpoint zone not reached')

// ── Candidate data file (only when all five are CANDIDATE — NOT APPROVED) ──

const ts = (v) => JSON.stringify(v)

export function buildDataFile(results, meta) {
  const lines = [
    '// GENERATED by scripts/build-routes.mjs (npm run routes:alangilan). Do not edit by hand.',
    '// Candidate road-following routes for the Alangilan corridors. Status per route below; every route here is',
    '// not verified, not confirmed, not approved and not production-ready, and is not used by the app.',
    '// Map data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright',
    '// Routing: OSRM demo server, driving profile. Coordinates are [lat, lng] (converted from OSRM [lon, lat]).',
    `// Path: simplified (Douglas–Peucker ${SIMPLIFY_TOLERANCE_M} m), rounded to ${DECIMALS} decimals, campus LOCATION not included.`,
    "import type { LatLng } from '../types'",
    '',
    'export type GeneratedRoute = {',
    '  id: string', '  status: string', '  approved: false', '  appViaLabel: string', '  destination: string',
    "  pathEnds: 'partial' | null", '  primaryRoads: string[]', '  primaryShare: number', '  perRoadM: Record<string, number>',
    '  originalEnd: LatLng', '  snappedStart: LatLng', '  snappedEnd: LatLng', '  startSnapM: number', '  endSnapM: number',
    '  connectorM: number', '  osrmDistanceM: number', '  osrmDurationS: number', '  destinationOvershootM: number | null',
    '  roads: { name: string | null; ref: string | null; distanceM: number }[]', '  needsReview: string[]',
    '  routeGeometrySha256: string', '  path: LatLng[]',
    '}',
    '',
    `export const ROUTES_META = { runId: ${ts(meta.runId)}, generatedAt: ${ts(meta.generatedAt)}, osrmDataVersion: ${ts(meta.osrmDataVersion)}, versions: ${ts(meta.versions)}, geojsonSha256: ${ts(meta.geojsonSha256)}, campus: ${ts(CAMPUS)} as LatLng, roadGroupSource: ${ts(ROAD_GROUP_SOURCE)} }`,
    '',
    'export const ALANGILAN_ROUTES: Record<string, GeneratedRoute> = {',
  ]
  for (const r of results) {
    lines.push(`  ${r.id}: {`)
    lines.push(`    id: ${ts(r.id)}, status: ${ts(statusOf(r))}, approved: false, appViaLabel: ${ts(r.appViaLabel)}, destination: ${ts(r.destination)},`)
    lines.push(`    pathEnds: ${ts(r.pathEnds)}, primaryRoads: ${ts(r.primaryRoads.map((p) => p.label))}, primaryShare: ${Math.round(r.primaryShare * 1000) / 1000},`)
    lines.push(`    perRoadM: ${ts(Object.fromEntries(Object.entries(r.perRoad).map(([k, v]) => [k, r1(v)])))},`)
    lines.push(`    originalEnd: ${ts(r.originalEnd)}, snappedStart: ${ts(r.snappedStart)}, snappedEnd: ${ts(r.snappedEnd)},`)
    lines.push(`    startSnapM: ${r1(r.startSnapM)}, endSnapM: ${r1(r.endSnapM)}, connectorM: ${r1(r.connectorM)},`)
    lines.push(`    osrmDistanceM: ${r1(r.osrmDistanceM)}, osrmDurationS: ${r1(r.osrmDurationS)}, destinationOvershootM: ${r1(r.overshoot.excessM)},`)
    lines.push('    roads: [')
    for (const x of r.roads) lines.push(`      { name: ${ts(x.name)}, ref: ${ts(x.ref)}, distanceM: ${r1(x.distanceM)} },`)
    lines.push('    ],')
    lines.push(`    needsReview: ${ts(r.needsReview)},`)
    lines.push(`    routeGeometrySha256: ${ts(r.routeGeometrySha256)},`)
    lines.push('    path: [')
    for (let i = 0; i < r.path.length; i += 4) {
      lines.push('      ' + r.path.slice(i, i + 4).map((p) => `[${p[0]}, ${p[1]}]`).join(', ') + ',')
    }
    lines.push('    ],')
    lines.push('  },')
  }
  lines.push('}', '')
  return lines.join('\n')
}

// ── Reports ─────────────────────────────────────────────────────────────────

function corridorSection(r) {
  const out = [`## ${r.id} — ${r.destination}`, '', `**Automated status: ${statusOf(r)}**${r.pathEnds === 'partial' ? ' · **Partial route:** ends before the destination town; not a full journey.' : ''}`, '']
  if (r.fetchError) out.push(`**Request failed:** ${r.fetchError}`, '')
  if (r.failures.length) out.push('**Blocking failures:**', ...r.failures.map((f) => `- ${f}`), '')
  if (r.warnings?.length) out.push('**Unresolved warnings (human review required):**', ...r.warnings.map((w) => `- \`${w.code}\` — ${w.text} (value: \`${JSON.stringify(w.value)}\`)`), '')
  if (!r.path) return out
  const o = r.overshoot
  const aux = r.snappedEndLoop
  out.push(
    '| Field | Value |', '|---|---|',
    `| App via label (unchanged, comparison only) | ${r.appViaLabel} |`,
    `| Primary roads (name match only; source: ${ROAD_GROUP_SOURCE}) | ${r.primaryRoads.map((p) => p.label).join('; ')} |`,
    `| Primary-road share (raw) | ${pct(r.primaryShare)} (${km(r.primaryMatchedM)} of ${km(r.osrmDistanceM)}) — ${Object.entries(r.perRoad).map(([k, v]) => `${k}: ${m(v)}`).join('; ')} |`,
    `| Road-name evidence (inspection aid, not proof; not evidence of what students ride) | ${roadEvidence(r)} |`,
    `| Requested destination (alangilan.ts) | ${fmtPt(r.originalEnd)} |`,
    `| Destination snap bearing constraint | ${r.approach ? `${r.approach.bearingDeg}° ± ${r.approach.rangeDeg}° (OSRM \`bearings=${r.bearingsParam}\`; affects only where OSRM snaps the destination)` : 'none'} |`,
    `| Snapped destination | ${fmtPt(r.snappedEnd)} (snap ${m(r.endSnapM)}, ${m(r.endMovedM)} from requested; road at snap: ${r.endSnapRoad ?? '—'}) |`,
    `| Snapped start | ${fmtPt(r.snappedStart)} (snap ${m(r.startSnapM)}; road: ${r.startSnapRoad ?? '—'}) |`,
    `| Campus → first road point (connector) | ${m(r.connectorM)} |`,
    `| Endpoint zone (${ENDPOINT_ZONE_M} m around requested destination) reached | ${o.measurable ? `yes — entry ${fmtPt(o.entryPoint.map((v) => Math.round(v * 1e5) / 1e5))} (segment ${o.entryIndex})` : 'no'} |`,
    `| Destination overshoot (primary) | ${overshootText(o)} → ${r.overshootClass} |`,
    ...(aux ? [`| Snapped-endpoint loop (auxiliary; cannot cause FAILED, cannot clear warnings) | ${overshootText(aux)} → ${aux.classification} |`] : []),
    `| Final approach direction (from final ${m(r.finalApproach.measuredOverM)} of geometry${r.finalApproach.shortRoute ? ', route shorter than 150 m' : ''}) | ${r.finalApproach.bearingDeg.toFixed(0)}° (${r.finalApproach.compass}); last road: ${r.finalStep?.name ?? '(unnamed)'}${r.finalStep?.ref ? ` [ref ${r.finalStep.ref}]` : ''} |`,
    `| OSRM distance / duration | ${km(r.osrmDistanceM)} / ${Math.round(r.osrmDurationS / 60)} min (car, free-flow; not BIYAHE's travel time) |`,
    `| Raw geometry (${r.rawPointCount} pts) / simplified (${r.path.length} pts) | ${km(r.rawLengthM)} (Δ ${pct(r.lengthDelta)} vs OSRM) / ${km(r.pathLengthM)} |`,
    `| Near-straight check (straight ≥ ${m(NEAR_STRAIGHT_MIN_M)} and ratio < ${NEAR_STRAIGHT_RATIO}) | straight ${m(r.nearStraight.straightM)}, ratio ${r.nearStraight.ratio?.toFixed(3) ?? '—'} → ${r.nearStraight.warn ? 'warning' : 'no warning'} |`,
    `| Longest segment (simplified) | ${m(r.maxSegmentM)} |`,
    `| Application path geometry hash (\`routeGeometrySha256\`, ${r.appPath ? r.appPath.length : '—'} pts incl. campus point) | \`${r.routeGeometrySha256 ?? '—'}\` |`,
    `| Campus exit (before first primary road) | ${r.campusExit.steps.map((s) => `${s.name ?? '(unnamed)'} ${m(s.distanceM)}`).join(' → ') || '—'} |`,
    `| Unnamed road distance | ${km(r.unnamedM)} |`,
    '',
    '**Roads used (OSRM steps, longest first; refs shown as metadata, never matched):**', '',
    '| Name | Ref | Distance |', '|---|---|---|',
    ...r.roads.map((x) => `| ${x.name ?? '(unnamed)'} | ${x.ref ?? ''} | ${m(x.distanceM)} |`),
    '',
    `**Forcing via-points:** ${r.vias.length === 0 ? 'none.' : ''}`,
    ...r.vias.map((v) => `- ${v.lat}, ${v.lon} — OSM way ${v.osmWayId ?? 'n/a'} (${v.osmRoadName ?? 'n/a'}); source: ${v.source}; reason: ${v.reason}; added by ${v.addedBy} on ${v.addedOn}`),
    ...(r.approach ? ['', `**Destination snap bearing provenance:** source: ${r.approach.source}; reason: ${r.approach.reason}; added by ${r.approach.addedBy} on ${r.approach.addedOn}.`] : []),
    '',
    '**Reviewer checklist:**', '',
    '- [ ] Follows the primary roads on OSM tiles at zoom 16–17 along its whole length',
    '- [ ] Final approach direction is acceptable (compare with any snap bearing constraint)',
    '- [ ] Snapped destination acceptable; partial routes recorded as partial',
    '- [ ] Campus exit checked on site (public access and usability)',
    '- [ ] Approved for Phase 2 (name, date):',
    '',
  )
  return out
}

export function buildReport(results, meta, { kind, dataHash }) {
  const failed = results.filter((r) => statusOf(r) === STATUS.failed)
  const review = results.filter((r) => statusOf(r) === STATUS.review)
  const candidateWritten = kind === 'candidate'
  const head = [
    kind === 'candidate' ? '# Alangilan route candidates — review report' : '# Alangilan route generation — diagnostic report',
    '',
    `> ${DIAGNOSTIC_MARK}. Every route below is not verified, not confirmed, not approved and not production-ready. Visual plausibility and road-name shares are not evidence of what students actually ride.`,
    '',
    `- Run ID: \`${meta.runId}\``,
    `- Generated: ${meta.generatedAt}`,
    candidateWritten
      ? `- Candidate data: \`src/campuses/alangilan.routes.ts\` (approved: false, not used by the app) — SHA-256 (LF-normalised): \`${dataHash}\``
      : `- Candidate data: not written — ${failed.length} FAILED, ${review.length} NEEDS REVIEW (the candidate file is written only when all five are ${STATUS.candidate}).`,
    `- Diagnostic geometry: \`docs/routes/diagnostics/alangilan-candidates.DIAGNOSTIC.${meta.runId}.geojson\` (git-ignored), viewed with \`docs/routes/diagnostic-viewer.html\``,
    `- Diagnostic GeoJSON SHA-256 (exact file bytes, no normalization): \`${meta.geojsonSha256}\``,
    `- Versions: routing policy \`${meta.versions.routingPolicyVersion}\`, geometry processing \`${meta.versions.geometryProcessingVersion}\`, warning schema \`${meta.versions.warningSchemaVersion}\`, approval schema \`${meta.versions.approvalSchemaVersion}\`, generator \`${meta.versions.generatorVersion}\` (informational)`,
    `- Routing: OSRM demo server (${OSRM_BASE}), profile \`${PROFILE}\`, data version: ${meta.osrmDataVersion ?? 'not reported'}`,
    `- Campus LOCATION: ${fmtPt(CAMPUS)}`,
    `- Processing: [lon, lat] → [lat, lng]; Douglas–Peucker ${SIMPLIFY_TOLERANCE_M} m; rounded to ${DECIMALS} decimals`,
    '- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License (ODbL 1.0).',
    '',
    '## Summary', '',
    STATUS_LEGEND,
    '',
    '| Corridor | Automated status | Partial | OSRM distance | Primary-road share (raw) | Evidence (inspection aid) | Destination overshoot | Endpoint snap | Final approach |',
    '|---|---|---|---|---|---|---|---|---|',
    ...results.map((r) => `| ${r.id} | ${statusOf(r)} | ${r.pathEnds === 'partial' ? 'yes' : '—'} | ${km(r.osrmDistanceM)} | ${pct(r.primaryShare)} | ${roadEvidence(r)} | ${r.overshoot ? (r.overshoot.measurable ? m(r.overshoot.excessM) : 'not measurable') : '—'} | ${m(r.endSnapM)} | ${r.finalApproach ? `${r.finalApproach.bearingDeg.toFixed(0)}° ${r.finalApproach.compass}` : '—'} |`),
    '',
  ]
  if (failed.length) head.push('## Blocking failures', '', ...failed.flatMap((r) => [r.fetchError ? `- **${r.id}**: ${r.fetchError}` : null, ...r.failures.map((f) => `- **${r.id}**: ${f}`)].filter(Boolean)), '')
  const warned = results.filter((r) => r.warnings?.length)
  if (warned.length) head.push('## Unresolved warnings', '', ...warned.flatMap((r) => r.warnings.map((w) => `- **${r.id}** \`${w.code}\`: ${w.text}`)), '')
  head.push(
    '## How to read this', '',
    '- Primary-road share = fraction of OSRM step distance whose road NAME matches the corridor\'s primary roads. Refs (e.g. 4, E2, 434-1) are shown but never counted. "Evidence" (none / weak < 50% / substantial) is an inspection aid, not proof that a route is correct or that students use it.',
    `- Destination overshoot: from the first point where the route geometry enters the ${ENDPOINT_ZONE_M} m zone around the requested destination, route distance remaining minus the direct distance to that destination (never below 0). Over 300 m is a warning, over 1,000 m a failure. If the zone is never entered, overshoot is not measurable and that is a warning, not a pass.`,
    '- The snapped-endpoint loop measure (San Jose) uses the same method around the snapped destination. It can only add a warning.',
    '- A destination snap bearing constraint only affects where OSRM snaps the destination. Requesting a destination snap bearing does not guarantee the route\'s final approach direction; compare the two values.',
    `- Near-straight warning: straight-line distance ≥ ${m(NEAR_STRAIGHT_MIN_M)} and route length ÷ straight-line distance < ${NEAR_STRAIGHT_RATIO}. The ${m(MAX_SEGMENT_GUARD_M)} segment limit only catches glitches.`,
    '- The campus exit (unnamed road, Neptune Street, Mercury Street) is an unresolved warning: public access and actual usability require on-site verification.',
    '- Lipa and Tanauan are partial corridor segments that stop before their towns, not full journeys.',
    '',
  )
  return [...head, ...results.flatMap(corridorSection)].join('\n')
}

// ── Diagnostic GeoJSON (never app data) ─────────────────────────────────────
// RFC 7946 GeoJSON: positions are [lon, lat].

const CORRIDOR_COLORS = { lipa: '#7c3aed', batangas: '#0369a1', bauan: '#b45309', sanjose: '#be123c', tanauan: '#047857' }
const toLonLat = (p) => [p[1], p[0]]

function zonePolygon(center, radiusM, sides = 64) {
  const f = localFrame(center)
  const ring = Array.from({ length: sides }, (_, i) => {
    const a = (2 * Math.PI * i) / sides
    return toLonLat(f.toLatLng([radiusM * Math.cos(a), radiusM * Math.sin(a)]))
  })
  return [[...ring, ring[0]]]
}

export function buildDiagnosticGeoJSON(results, meta) {
  const base = (r) => ({ status: DIAGNOSTIC_MARK, runId: meta.runId, corridorId: r.id, corridorName: r.destination, appViaLabel: r.appViaLabel, validation: statusOf(r), pathEnds: r.pathEnds })
  const features = [{
    type: 'Feature', geometry: { type: 'Point', coordinates: toLonLat(CAMPUS) },
    properties: { status: DIAGNOSTIC_MARK, runId: meta.runId, kind: 'campus', name: 'BatStateU Alangilan (campus LOCATION)' },
  }]
  for (const r of results) {
    const color = CORRIDOR_COLORS[r.id] ?? '#334155'
    const o = r.overshoot
    const aux = r.snappedEndLoop
    const summary = {
      ...base(r),
      failures: r.fetchError ? [r.fetchError, ...r.failures] : r.failures,
      warnings: r.warnings ?? [],
      reviewFlags: r.needsReview ?? [],
      routeGeometrySha256: r.routeGeometrySha256 ?? null,
      primaryRoads: r.primaryRoads.map((p) => p.label),
      primaryRoadSource: ROAD_GROUP_SOURCE,
      primaryShareRaw: r.primaryShare ?? null,
      perRoadM: r.perRoad ?? {},
      roadNameEvidence: roadEvidence(r),
      roadNameEvidenceNote: 'Inspection aid only, not proof that the route is correct or that students use it.',
      osrmDistanceM: r.osrmDistanceM ?? null, osrmDurationS: r.osrmDurationS ?? null, osrmDataVersion: r.osrmDataVersion ?? null,
      connectorM: r.connectorM ?? null, startSnapM: r.startSnapM ?? null, endSnapM: r.endSnapM ?? null,
      requestedDestination: r.originalEnd,
      destinationSnapBearingConstraint: r.approach ? { bearingDeg: r.approach.bearingDeg, rangeDeg: r.approach.rangeDeg, osrmBearingsParam: r.bearingsParam, note: 'Affects only where OSRM snaps the destination; does not guarantee the final approach direction.' } : null,
      snappedDestination: r.snappedEnd ?? null, endSnapRoad: r.endSnapRoad ?? null,
      endpointZoneReached: o ? o.measurable : null,
      destinationOvershootM: o ? o.excessM : null,
      destinationOvershootClass: r.overshootClass ?? null,
      snappedEndpointLoopM: aux ? aux.excessM : null,
      snappedEndpointLoopClass: aux ? aux.classification : null,
      finalApproachBearingDeg: r.finalApproach ? Math.round(r.finalApproach.bearingDeg) : null,
      finalApproachCompass: r.finalApproach?.compass ?? null,
      lastRoadName: r.finalStep?.name ?? null, lastRoadRef: r.finalStep?.ref ?? null,
      campusExit: r.campusExit ?? null,
      roads: r.roads ?? [],
    }
    features.push({ type: 'Feature', geometry: r.rawGeometry ? { type: 'LineString', coordinates: r.rawGeometry } : null, properties: { ...summary, kind: 'route-raw', stroke: color, 'stroke-width': 4 } })
    if (!r.path) continue
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.path.map(toLonLat) }, properties: { ...base(r), kind: 'route-simplified', note: 'What would be stored as candidate data', stroke: color, 'stroke-width': 2 } })
    for (const [i, s] of r.steps.entries()) {
      features.push({
        type: 'Feature', geometry: s.coordinates ? { type: 'LineString', coordinates: s.coordinates } : null,
        properties: { ...base(r), kind: 'step', index: i, roadName: s.name, ref: s.ref, distanceM: r1(s.distanceM), osrmDistanceM: s.distanceM, maneuver: s.maneuver, matchesPrimaryRoad: s.matchesPrimaryRoad, stroke: s.matchesPrimaryRoad ? '#16a34a' : '#64748b', 'stroke-width': 3 },
      })
    }
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: toLonLat(r.originalEnd) }, properties: { ...base(r), kind: 'original-end', note: 'Requested destination (src/campuses/alangilan.ts)' } })
    features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: zonePolygon(r.originalEnd, ENDPOINT_ZONE_M) }, properties: { ...base(r), kind: 'endpoint-zone', radiusM: ENDPOINT_ZONE_M, reached: o.measurable } })
    if (o.measurable) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: toLonLat(o.entryPoint) }, properties: { ...base(r), kind: 'zone-entry', excessM: r1(o.excessM), remainingM: r1(o.remainingM), directM: r1(o.directM) } })
    if (aux) {
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: zonePolygon(r.snappedEndExact, ENDPOINT_ZONE_M) }, properties: { ...base(r), kind: 'snapped-endpoint-zone', radiusM: ENDPOINT_ZONE_M, reached: aux.measurable } })
      if (aux.measurable) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: toLonLat(aux.entryPoint) }, properties: { ...base(r), kind: 'snapped-zone-entry', excessM: r1(aux.excessM) } })
    }
    if (r.snappedStart) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: toLonLat(r.snappedStart) }, properties: { ...base(r), kind: 'snapped-start', snapM: r.startSnapM, road: r.startSnapRoad, osrmLocation: r.startWaypointRaw.location, osrmName: r.startWaypointRaw.name } })
    if (r.snappedEnd) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: toLonLat(r.snappedEnd) }, properties: { ...base(r), kind: 'snapped-end', snapM: r.endSnapM, movedFromRequestedM: r.endMovedM, road: r.endSnapRoad, osrmLocation: r.endWaypointRaw.location, osrmName: r.endWaypointRaw.name } })
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [toLonLat(r.finalApproach.from), toLonLat(r.finalApproach.to)] }, properties: { ...base(r), kind: 'final-approach', bearingDeg: Math.round(r.finalApproach.bearingDeg), compass: r.finalApproach.compass, measuredOverM: r1(r.finalApproach.measuredOverM) } })
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [toLonLat(CAMPUS), toLonLat(r.path[0])] }, properties: { ...base(r), kind: 'connector', connectorM: r.connectorM, overReviewLimit: r.connectorM > CONNECTOR_REVIEW_M } })
  }
  return {
    type: 'FeatureCollection',
    biyahe: {
      status: `${DIAGNOSTIC_MARK} — NOT APP DATA`,
      warning: 'Candidate geometry for human inspection only. Never import into the BIYAHE application.',
      runId: meta.runId, generatedAt: meta.generatedAt,
      versions: meta.versions,
      diagnosticSchemaVersion: DIAG_SCHEMA_VERSION,
      routingPolicy: routingPolicyParams(),
      source: `OSRM demo server (${OSRM_BASE}), profile ${PROFILE}`, osrmDataVersion: meta.osrmDataVersion,
      attribution: '© OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright',
      statuses: STATUS,
    },
    features,
  }
}

// Diagnostic GeoJSON text and the SHA-256 of the exact UTF-8 bytes that will be written (no line-ending
// normalization). The file is written from this same text, so the hash covers the written bytes.
export function serializeDiagnosticGeoJSON(results, meta) {
  const text = JSON.stringify(buildDiagnosticGeoJSON(results, meta), null, 1) + '\n'
  return { text, sha256: geojsonSha256(new TextEncoder().encode(text)) }
}

// ── Re-analysis from a diagnostic (ds-1) ────────────────────────────────────
// The diagnostic stores the raw OSRM data analyse() consumes; everything else in it is derived. These
// functions rebuild the OSRM-shaped response from that raw data alone and re-run the same analyse(), so the
// approval validator never trusts stored statuses, warnings or metrics. Every analyse() input is listed here:
//   route:    geometry.coordinates (route-raw geometry), distance (osrmDistanceM), duration (osrmDurationS)
//   body:     data_version (route-raw osrmDataVersion)
//   steps:    name (roadName), ref, distance (osrmDistanceM, exact), maneuver.type (maneuver), geometry, order (index)
//   waypoints[first|last]: location (osrmLocation, exact), distance (snapM), name (osrmName)
//   config:   the corridor (CORRIDORS), CAMPUS, CAMPUS_ACCESS_ROADS, thresholds, bearings (bearingsFor)
// Nothing is defaulted: a missing, duplicate, ill-typed or out-of-order field throws.

const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k)
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v)
const isPosition = (p) => Array.isArray(p) && p.length >= 2 && isFiniteNumber(p[0]) && isFiniteNumber(p[1])

export function rebuildOsrmBody(geo, corridorId) {
  const fail = (msg) => { throw new Error(`${corridorId}: cannot rebuild the OSRM response from the diagnostic: ${msg}`) }
  if (!geo || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) fail('not a FeatureCollection')
  if (geo.biyahe?.diagnosticSchemaVersion !== DIAG_SCHEMA_VERSION) fail(`diagnosticSchemaVersion is not ${DIAG_SCHEMA_VERSION}`)
  const mine = geo.features.filter((f) => f?.properties?.corridorId === corridorId)
  const one = (kind) => {
    const found = mine.filter((f) => f.properties.kind === kind)
    if (found.length !== 1) fail(`expected exactly one ${kind} feature, found ${found.length}`)
    return found[0]
  }
  const field = (obj, key, what, check, expected) => {
    if (!own(obj, key)) fail(`${what}.${key} is missing`)
    if (!check(obj[key])) fail(`${what}.${key} must be ${expected}`)
    return obj[key]
  }
  const strOrNull = (v) => v === null || typeof v === 'string'

  const raw = one('route-raw')
  if (raw.geometry?.type !== 'LineString' || !Array.isArray(raw.geometry.coordinates) || raw.geometry.coordinates.length < 2
    || !raw.geometry.coordinates.every(isPosition)) fail('route-raw geometry must be a LineString of [lon, lat] positions')
  const rp = raw.properties
  const distance = field(rp, 'osrmDistanceM', 'route-raw', isFiniteNumber, 'a finite number')
  const duration = field(rp, 'osrmDurationS', 'route-raw', (v) => v === null || isFiniteNumber(v), 'a finite number or null')
  const dataVersion = field(rp, 'osrmDataVersion', 'route-raw', strOrNull, 'a string or null')

  const stepFeatures = mine.filter((f) => f.properties.kind === 'step')
  if (stepFeatures.length === 0) fail('no step features')
  const steps = stepFeatures.map((f, i) => {
    const p = f.properties
    const what = `step[${i}]`
    if (field(p, 'index', what, Number.isInteger, 'an integer') !== i) fail(`step indexes must be 0..${stepFeatures.length - 1} in order (found ${p.index} at position ${i})`)
    const g = f.geometry
    if (g !== null && !(g?.type === 'LineString' && Array.isArray(g.coordinates))) fail(`${what}.geometry must be a LineString or null`)
    const maneuver = field(p, 'maneuver', what, strOrNull, 'a string or null')
    return {
      name: field(p, 'roadName', what, strOrNull, 'a string or null'),
      ref: field(p, 'ref', what, strOrNull, 'a string or null'),
      distance: field(p, 'osrmDistanceM', what, isFiniteNumber, 'a finite number (exact OSRM step distance)'),
      maneuver: maneuver === null ? null : { type: maneuver },
      geometry: g === null ? null : { type: 'LineString', coordinates: g.coordinates },
    }
  })

  const waypoint = (kind) => {
    const p = one(kind).properties
    return {
      location: field(p, 'osrmLocation', kind, isPosition, 'an exact [lon, lat] position'),
      distance: field(p, 'snapM', kind, isFiniteNumber, 'a finite number'),
      name: field(p, 'osrmName', kind, strOrNull, 'a string or null'),
    }
  }

  return {
    code: 'Ok',
    data_version: dataVersion,
    routes: [{
      distance, duration: duration === null ? undefined : duration,
      geometry: { type: 'LineString', coordinates: raw.geometry.coordinates },
      legs: [{ steps }],
    }],
    waypoints: [waypoint('snapped-start'), waypoint('snapped-end')],
  }
}

// Re-runs the generator's own analyse() on a corridor's raw data from the diagnostic.
export function reanalyseFromDiagnostic(geo, corridor) {
  return analyse(corridor, rebuildOsrmBody(geo, corridor.id), bearingsFor(corridor))
}

const canonical = (v) => JSON.stringify(v)

// Re-analyses one corridor and requires every stored feature of that corridor (statuses, warnings, hashes,
// paths, metrics, zones, steps …) to equal the features regenerated from the re-analysis, exactly.
// Returns { result, problems }; `result` is the recomputed analysis (null if it could not be rebuilt).
export function verifyDiagnosticRoute(geo, corridor) {
  const id = corridor.id
  let r
  try { r = reanalyseFromDiagnostic(geo, corridor) } catch (e) { return { result: null, problems: [e.message] } }
  const problems = []
  const stored = geo.features.filter((f) => f?.properties?.corridorId === id)
  const storedRaw = stored.find((f) => f.properties.kind === 'route-raw')?.properties ?? {}
  const status = statusOf(r)
  if (!Object.values(STATUS).includes(storedRaw.validation)) problems.push(`${id}: unknown stored status ${JSON.stringify(storedRaw.validation)}`)
  if (storedRaw.validation !== status) problems.push(`${id}: stored status ${JSON.stringify(storedRaw.validation)} does not match the recomputed status "${status}"`)
  if (canonical(storedRaw.warnings) !== canonical(r.warnings)) problems.push(`${id}: stored warnings do not match the recomputed warnings`)
  if (storedRaw.routeGeometrySha256 !== r.routeGeometrySha256) problems.push(`${id}: stored routeGeometrySha256 does not match the recomputed application path`)
  const simplified = stored.find((f) => f.properties.kind === 'route-simplified')?.geometry?.coordinates
  if (r.path && canonical(simplified) !== canonical(r.path.map(toLonLat))) problems.push(`${id}: stored route-simplified does not match the recomputed path`)

  // Every other stored value: regenerate this corridor's features and compare them one by one.
  const regenerated = buildDiagnosticGeoJSON([r], { runId: geo.biyahe?.runId }).features.filter((f) => f.properties?.corridorId === id)
  if (stored.length !== regenerated.length) {
    problems.push(`${id}: the diagnostic has ${stored.length} features for this route; the recomputed analysis has ${regenerated.length}`)
  } else {
    stored.forEach((f, i) => {
      const g = regenerated[i]
      if (canonical(f) === canonical(g)) return
      const kind = g.properties.kind
      if (f.properties?.kind !== kind) { problems.push(`${id}: feature ${i} is ${JSON.stringify(f.properties?.kind)}; expected ${kind}`); return }
      if (canonical(f.geometry) !== canonical(g.geometry)) problems.push(`${id}: ${kind} geometry does not match the recomputed analysis`)
      const keys = new Set([...Object.keys(f.properties), ...Object.keys(JSON.parse(canonical(g.properties)))])
      for (const k of keys) {
        if (canonical(f.properties[k]) !== canonical(g.properties[k])) problems.push(`${id}: ${kind}${kind === 'step' ? `[${g.properties.index}]` : ''}.${k} does not match the recomputed analysis`)
      }
    })
  }
  return { result: r, problems: [...new Set(problems)] }
}

// Re-checks staged GeoJSON text: the bytes hash to the recorded value, it parses, has the diagnostic
// markers, and every position is [lon, lat] in bounds.
export const verifyGeoJsonText = (expectedSha256) => (text) => {
  if (geojsonSha256(new TextEncoder().encode(text)) !== expectedSha256) throw new Error('Staged diagnostic GeoJSON bytes do not match the recorded SHA-256')
  const g = JSON.parse(text)
  if (g.type !== 'FeatureCollection' || !String(g.biyahe?.status).startsWith(DIAGNOSTIC_MARK)) throw new Error('Diagnostic GeoJSON lacks its marker')
  for (const f of g.features) {
    if (f.properties?.status !== DIAGNOSTIC_MARK) throw new Error('A diagnostic feature lacks its status marker')
    if (!f.geometry) continue
    const t = f.geometry.type
    const positions = t === 'Point' ? [f.geometry.coordinates] : t === 'LineString' ? f.geometry.coordinates : t === 'Polygon' ? f.geometry.coordinates.flat(1) : null
    if (!positions) throw new Error(`Unexpected geometry type ${t}`)
    for (const p of positions) {
      if (!withinAlangilanRoutingBounds([p[1], p[0]])) throw new Error(`Diagnostic GeoJSON position out of bounds or not [lon, lat]: ${JSON.stringify(p)}`)
    }
  }
}

// Re-checks a staged data file by parsing its path arrays back out of the text.
function verifyDataText(results) {
  return (text) => {
    for (const r of results) {
      const block = text.slice(text.indexOf(`  ${r.id}: {`))
      const pathText = block.slice(block.indexOf('path: [') + 'path: ['.length, block.indexOf('\n    ],\n  },'))
      const pts = [...pathText.matchAll(/\[(-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\]/g)].map((x) => [Number(x[1]), Number(x[2])])
      if (pts.length !== r.path.length) throw new Error(`Staged data for ${r.id}: ${pts.length} points read back, expected ${r.path.length}`)
      pts.forEach((p, i) => {
        if (!withinAlangilanRoutingBounds(p) || p[0] !== r.path[i][0] || p[1] !== r.path[i][1]) throw new Error(`Staged data for ${r.id}: point ${i} did not read back correctly`)
      })
    }
  }
}

// Wording guard: no output may claim a route is verified / confirmed / approved / production-ready.
export function assertNoPositiveClaims(label, text) {
  const claims = findPositiveClaims(text)
  if (claims.length) {
    throw new Error(`Wording guard: ${label} contains positive claims:\n${claims.slice(0, 10).map((c) => `  line ${c.line} "${c.word}": ${c.text.slice(0, 160)}`).join('\n')}`)
  }
}

// ── Atomic file promotion ───────────────────────────────────────────────────

function writeDurable(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  const fd = openSync(file, 'w')
  try { writeSync(fd, text, null, 'utf8'); fsyncSync(fd) } finally { closeSync(fd) }
}

// Stage → back up → promote, recorded in a journal; any error rolls everything back.
// entries: [{ target, text, verify(text) }]
export function promote(entries, runId, { journalDir = JOURNAL_DIR, failAt = null } = {}) {
  const journalPath = join(journalDir, `.build-routes.${runId}.journal.json`)
  const state = entries.map((e) => ({
    target: e.target, staged: `${e.target}.${runId}.staged`, backup: `${e.target}.${runId}.bak`,
    staged_ok: false, backedUp: false, promoted: false,
  }))
  const saveJournal = () => writeDurable(journalPath, JSON.stringify({ runId, entries: state }, null, 2))
  const inject = (step) => { if (failAt === step) throw new Error(`injected failure at ${step}`) }

  try {
    saveJournal()
    entries.forEach((e, i) => {
      writeDurable(state[i].staged, e.text)
      const back = readFileSync(state[i].staged, 'utf8')
      if (back !== e.text) throw new Error(`Staged file did not read back identically: ${state[i].staged}`)
      e.verify?.(back)
      state[i].staged_ok = true
      saveJournal()
      inject(`stage:${i}`)
    })
    state.forEach((s, i) => {
      if (existsSync(s.target)) { renameSync(s.target, s.backup); s.backedUp = true; saveJournal() }
      inject(`backup:${i}`)
    })
    state.forEach((s, i) => {
      renameSync(s.staged, s.target); s.promoted = true; saveJournal()
      inject(`promote:${i}`)
    })
  } catch (err) {
    const problems = rollback(state)
    if (problems.length) {
      console.error(['ROLLBACK INCOMPLETE. Journal kept at ' + relative(ROOT, journalPath), ...problems.map((p) => '  ' + p),
        'Manual restore: for each entry with backedUp=true rename the .bak file to its target; delete .staged files; then delete the journal.'].join('\n'))
    } else rmSync(journalPath, { force: true })
    throw err
  }
  for (const s of state) if (s.backedUp) rmSync(s.backup, { force: true })
  rmSync(journalPath, { force: true })
}

function rollback(state) {
  const problems = []
  for (const s of [...state].reverse()) {
    try {
      if (s.promoted) rmSync(s.target, { force: true })
      if (s.backedUp) renameSync(s.backup, s.target)
      rmSync(s.staged, { force: true })
    } catch (e) {
      problems.push(`${basename(s.target)}: ${e.message}`)
    }
  }
  return problems
}

// ── Main ────────────────────────────────────────────────────────────────────

// Builds every output for a set of results and applies the generation rules. Exported so the
// promotion and wording logic can be exercised offline with fixture results.
export function writeOutputs(results, runMeta, { promoteFn = promote } = {}) {
  const statuses = results.map(statusOf)
  const allCandidate = results.length === CORRIDORS.length && statuses.every((s) => s === STATUS.candidate)

  // The GeoJSON is built first (it carries the run ID and versions); its exact-bytes hash then goes into
  // the report and any candidate data, so every output of the run names the same run, versions and hash.
  const baseMeta = { ...runMeta, versions: runMeta.versions ?? versionMetadata() }
  const { text: geoJsonText, sha256: geojsonHash } = serializeDiagnosticGeoJSON(results, baseMeta)
  const meta = { ...baseMeta, geojsonSha256: geojsonHash }

  const diagnosticText = buildReport(results, meta, { kind: 'diagnostic', dataHash: null })
  assertNoPositiveClaims('diagnostic report', diagnosticText)
  assertNoPositiveClaims('diagnostic GeoJSON', geoJsonText)

  let candidate = null
  if (allCandidate) {
    const dataText = buildDataFile(results, meta)
    const reportText = buildReport(results, meta, { kind: 'candidate', dataHash: contentHash(dataText) })
    assertNoPositiveClaims('candidate data', dataText)
    assertNoPositiveClaims('candidate report', reportText)
    candidate = { dataText, reportText }
  }

  // Diagnostics first (always), as one transaction; then the candidate pair, as another.
  const geoTarget = diagnosticGeoJsonTarget(meta.runId)
  promoteFn([
    { target: DIAGNOSTIC_TARGET, text: diagnosticText },
    { target: geoTarget, text: geoJsonText, verify: verifyGeoJsonText(geojsonHash) },
  ], meta.runId)
  if (candidate) {
    promoteFn([
      { target: DATA_TARGET, text: candidate.dataText, verify: verifyDataText(results) },
      { target: REPORT_TARGET, text: candidate.reportText },
    ], meta.runId)
  }
  return { statuses, allCandidate, geoTarget, geojsonSha256: geojsonHash, meta }
}

async function main() {
  checkInvocation()
  checkRuntime()
  checkProvenance()
  checkLeftovers()

  const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${randomBytes(3).toString('hex')}`
  const generatedAt = new Date().toISOString()
  console.log(`Run ${runId}: ${CORRIDORS.length} corridors, one request every >= ${MIN_REQUEST_GAP_MS} ms`)

  const results = []
  for (const c of CORRIDORS) {
    process.stdout.write(`  ${c.id} … `)
    try {
      const { body, bearings } = await fetchRoute(c)
      const r = analyse(c, body, bearings)
      results.push(r)
      console.log(`${statusOf(r)}${r.failures.length ? ` (${r.failures.length} failure${r.failures.length > 1 ? 's' : ''})` : ''}${r.needsReview.length ? ` (${r.needsReview.length} warning${r.needsReview.length > 1 ? 's' : ''})` : ''}`)
    } catch (e) {
      if (!(e instanceof Failure)) throw e
      results.push({ ...baseResult(c), fetchError: `${e.kind}: ${e.message}` })
      console.log(`${STATUS.failed} (${e.kind})`)
    }
  }

  const versions = [...new Set(results.map((r) => r.osrmDataVersion).filter(Boolean))]
  const meta = { runId, generatedAt, osrmDataVersion: versions.join(', ') || null, versions: versionMetadata() }
  const { statuses, allCandidate, geoTarget, geojsonSha256: geoHash } = writeOutputs(results, meta)

  console.log(`\nDiagnostic report:  ${relative(ROOT, DIAGNOSTIC_TARGET)}`)
  console.log(`Diagnostic GeoJSON: ${relative(ROOT, geoTarget)} (${DIAGNOSTIC_MARK}; SHA-256 ${geoHash})`)
  if (allCandidate) console.log(`Candidate data:     ${relative(ROOT, DATA_TARGET)} and ${relative(ROOT, REPORT_TARGET)} (approved: false; not used by the app)`)
  else console.log(`Candidate data:     not written (${statuses.filter((s) => s !== STATUS.candidate).length} corridor(s) are ${STATUS.failed} or ${STATUS.review}).`)
  if (statuses.includes(STATUS.failed)) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(`\nAborted: ${e?.stack ?? e}`)
    console.error('Staged writes were rolled back; candidate files were not created or replaced.')
    process.exitCode = 1
  })
}
