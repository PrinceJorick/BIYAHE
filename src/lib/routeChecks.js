// Pure route-check functions for the developer-only route generator (scripts/build-routes.mjs).
// Plain ES module JavaScript so the generator can run with plain `node`; types in ./routeChecks.d.ts.
// Unit-tested in ./routeChecks.test.ts, which runs before every generator run. Not used by the app.
//
// Coordinates are BIYAHE LatLng [lat, lng] unless a name says otherwise.

import { dedupeConsecutive, haversineM, osrmToLatLng, pathLengthM, roundLatLng, simplify } from './geo.js'
import {
  APPROVAL_SCHEMA_PARAMS, APPROVAL_SCHEMA_VERSION, DIAG_SCHEMA_VERSION, GEOMETRY_PROCESSING_PARAMS,
  incompatibleVersionKeys, VERSIONS, WARNING_SCHEMA_PARAMS,
} from './routeVersions.js'
import { samePoint } from './routeHash.js'

const EARTH_RADIUS_M = 6_371_008.8
const rad = (d) => (d * Math.PI) / 180
const deg = (r) => (r * 180) / Math.PI

// ── Road names ──────────────────────────────────────────────────────────────

// Trim, collapse whitespace, unify hyphen-like characters (‐ ‑ ‒ – — ― −) to '-', drop spaces around
// hyphens, lowercase. null / undefined / empty → ''.
export function normalizeRoadName(s) {
  if (s == null) return ''
  return String(s)
    .normalize('NFC')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim()
    .toLowerCase()
}

// Share of route distance on steps whose NAME matches one of the primary roads.
// - The step `ref` is never consulted: a ref alone never counts.
// - Each step is counted at most once, even if it matches several (or duplicate) group entries.
// - perRoad (keyed by the first label for each distinct normalised name) sums exactly to matchedM.
// steps: [{ name, ref, distanceM }]; primaryRoads: [{ label, name }]
export function matchPrimaryRoads(steps, primaryRoads, totalM) {
  const targets = []
  for (const r of primaryRoads) {
    const key = normalizeRoadName(r.name)
    if (key && !targets.some((t) => t.key === key)) targets.push({ key, label: r.label })
  }
  const perRoad = Object.fromEntries(targets.map((t) => [t.label, 0]))
  let matchedM = 0
  for (const s of steps) {
    const d = Number.isFinite(s.distanceM) && s.distanceM > 0 ? s.distanceM : 0
    const key = normalizeRoadName(s.name)
    if (!key) continue
    const target = targets.find((t) => t.key === key)
    if (!target) continue
    matchedM += d
    perRoad[target.label] += d
  }
  const share = totalM > 0 ? Math.min(1, matchedM / totalM) : 0
  return { matchedM, share, perRoad }
}

// ── Local metric frame ──────────────────────────────────────────────────────

// Equirectangular projection centred on `origin`, in metres. Accurate to far better than 0.1% within a
// few km, which is all the endpoint-zone checks need. toLatLng is the exact inverse of toXY.
export function localFrame(origin) {
  const [lat0, lng0] = origin
  const k = Math.cos(rad(lat0))
  return {
    toXY: (p) => [rad(p[1] - lng0) * k * EARTH_RADIUS_M, rad(p[0] - lat0) * EARTH_RADIUS_M],
    toLatLng: ([x, y]) => [lat0 + deg(y / EARTH_RADIUS_M), lng0 + deg(x / (k * EARTH_RADIUS_M))],
  }
}

// ── Endpoint-zone excess (overshoot) ────────────────────────────────────────

export const ENDPOINT_ZONE_M = 100

// Extra travel after the route first enters the zone of radius `radiusM` around `ref`.
// Entry = earliest point along the continuous geometry where a segment crosses or touches the circle
// (detected even when neither segment vertex is inside). If path[0] is inside, entry is path[0].
//   remainingM = route distance from the entry point to the end of the route
//   directM    = geodesic distance from the entry point to ref
//   excessM    = max(0, remainingM - directM)
// If the route never enters the zone: { measurable: false, excessM: null } — never 0.
export function computeZoneExcess(path, ref, radiusM = ENDPOINT_ZONE_M) {
  if (!Array.isArray(path) || path.length < 2) throw new TypeError('computeZoneExcess needs a path of at least 2 points')
  const frame = localFrame(ref)
  const xy = path.map(frame.toXY)
  const R2 = radiusM * radiusM
  const result = (index, t, point) => {
    const remainingM = haversineM(point, path[index + 1] ?? point) + pathLengthM(path.slice(index + 1))
    const directM = haversineM(point, ref)
    return { measurable: true, entryIndex: index, entryT: t, entryPoint: point, remainingM, directM, excessM: Math.max(0, remainingM - directM) }
  }
  if (xy[0][0] ** 2 + xy[0][1] ** 2 <= R2) return result(0, 0, path[0])
  for (let i = 0; i < xy.length - 1; i++) {
    const [ax, ay] = xy[i]
    const dx = xy[i + 1][0] - ax
    const dy = xy[i + 1][1] - ay
    const A = dx * dx + dy * dy
    if (A === 0) continue
    const B = 2 * (ax * dx + ay * dy)
    const C = ax * ax + ay * ay - R2
    const disc = B * B - 4 * A * C
    if (disc < 0) continue
    const t = (-B - Math.sqrt(disc)) / (2 * A) // a is outside (C > 0), so the smaller root is the entry
    if (t < 0 || t > 1) continue
    return result(i, t, frame.toLatLng([ax + t * dx, ay + t * dy]))
  }
  return { measurable: false, entryIndex: null, entryT: null, entryPoint: null, remainingM: null, directM: null, excessM: null }
}

const assertExcess = (excess) => {
  if (excess === null) return
  if (typeof excess !== 'number' || !Number.isFinite(excess) || excess < 0) {
    throw new TypeError(`Invalid excess distance: ${String(excess)}`)
  }
}

// Primary destination overshoot. Strictly greater-than thresholds.
export function classifyOvershoot(excess) {
  assertExcess(excess)
  if (excess === null) return 'not-measurable'
  if (excess > 1000) return 'fail'
  if (excess > 300) return 'review'
  return 'none'
}

// Auxiliary snapped-endpoint loop measure. Can only add a review warning — never 'fail'.
export function classifySnappedEndLoop(excess) {
  assertExcess(excess)
  if (excess === null) return 'not-measurable'
  return excess > 300 ? 'review' : 'none'
}

// ── Direction ───────────────────────────────────────────────────────────────

// Initial great-circle bearing a → b in degrees [0, 360).
export function bearingDeg(a, b) {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]))
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))
  return (deg(Math.atan2(y, x)) + 360) % 360
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
export const compassPoint = (d) => COMPASS[Math.round(d / 22.5) % 16]

// Point `distanceM` before the end of the path, measured along it (linear interpolation).
export function pointBeforeEnd(path, distanceM) {
  let remaining = distanceM
  for (let i = path.length - 1; i > 0; i--) {
    const seg = haversineM(path[i - 1], path[i])
    if (seg >= remaining && seg > 0) {
      const t = 1 - remaining / seg
      return [path[i - 1][0] + t * (path[i][0] - path[i - 1][0]), path[i - 1][1] + t * (path[i][1] - path[i - 1][1])]
    }
    remaining -= seg
  }
  return path[0]
}

// Actual final approach direction, from the final `lastM` metres of route geometry.
export function finalApproach(path, lastM = 150) {
  const totalM = pathLengthM(path)
  const shortRoute = totalM <= lastM
  const from = shortRoute ? path[0] : pointBeforeEnd(path, lastM)
  const to = path[path.length - 1]
  const b = bearingDeg(from, to)
  return { bearingDeg: b, compass: compassPoint(b), from, to, measuredOverM: shortRoute ? totalM : lastM, shortRoute }
}

// ── Near-straight ───────────────────────────────────────────────────────────

export const NEAR_STRAIGHT_MIN_M = 500
export const NEAR_STRAIGHT_RATIO = 1.02

// Warning only when the straight-line distance is at least 500 m AND route length / straight < 1.02.
// Below 500 m the ratio is unstable, so no warning is raised.
export function isNearStraight(straightM, lengthM) {
  if (!(straightM >= NEAR_STRAIGHT_MIN_M)) return false
  return lengthM / straightM < NEAR_STRAIGHT_RATIO
}

export function nearStraight(path) {
  const straightM = haversineM(path[0], path[path.length - 1])
  const lengthM = pathLengthM(path)
  return { straightM, lengthM, ratio: straightM > 0 ? lengthM / straightM : null, warn: isNearStraight(straightM, lengthM) }
}

// ── OSRM bearings ───────────────────────────────────────────────────────────

const isInt = (n) => typeof n === 'number' && Number.isInteger(n)

// OSRM `bearings`: one entry per coordinate, "bearing,range" or empty. Bearing is an integer 0–360
// inclusive; range an integer 0–180 inclusive. Returns null when nothing is constrained (omit the param).
// constraints: [{ index, bearingDeg, rangeDeg }]
export function buildBearingsParam(coordCount, constraints) {
  if (!isInt(coordCount) || coordCount < 2) throw new TypeError(`coordCount must be an integer >= 2, got ${coordCount}`)
  if (!constraints?.length) return null
  const entries = new Array(coordCount).fill('')
  for (const c of constraints) {
    if (!isInt(c.index) || c.index < 0 || c.index >= coordCount) throw new RangeError(`Bearing index ${c.index} is outside 0..${coordCount - 1}`)
    if (!isInt(c.bearingDeg) || c.bearingDeg < 0 || c.bearingDeg > 360) throw new RangeError(`Bearing must be an integer 0–360, got ${c.bearingDeg}`)
    if (!isInt(c.rangeDeg) || c.rangeDeg < 0 || c.rangeDeg > 180) throw new RangeError(`Bearing range must be an integer 0–180, got ${c.rangeDeg}`)
    if (entries[c.index] !== '') throw new RangeError(`Duplicate bearing for coordinate ${c.index}`)
    entries[c.index] = `${c.bearingDeg},${c.rangeDeg}`
  }
  return entries.join(';')
}

// Provenance and value checks for a destination snap bearing constraint. Returns a list of problems.
export function validateApproach(a) {
  const problems = []
  if (a?.coordinate !== 'end') problems.push("coordinate must be 'end'")
  if (!isInt(a?.bearingDeg) || a.bearingDeg < 0 || a.bearingDeg > 360) problems.push('bearingDeg must be an integer 0–360')
  if (!isInt(a?.rangeDeg) || a.rangeDeg < 0 || a.rangeDeg > 180) problems.push('rangeDeg must be an integer 0–180')
  for (const f of ['source', 'reason', 'addedBy', 'addedOn']) {
    if (typeof a?.[f] !== 'string' || !a[f].trim()) problems.push(`${f} is required`)
  }
  return problems
}

// ── Campus exit ─────────────────────────────────────────────────────────────

// Steps before the first primary-road step. usesAccessRoads is true when any of accessNames
// (e.g. Neptune Street, Mercury Street) appears there. Unnamed steps are listed and counted too.
export function detectCampusExit(steps, accessNames, primaryRoads) {
  const access = new Set(accessNames.map(normalizeRoadName))
  const primary = new Set(primaryRoads.map((r) => normalizeRoadName(r.name)))
  const before = []
  for (const s of steps) {
    const key = normalizeRoadName(s.name)
    if (key && primary.has(key)) break
    before.push(s)
  }
  const relevant = before.filter((s) => { const k = normalizeRoadName(s.name); return !k || access.has(k) })
  return {
    usesAccessRoads: relevant.some((s) => access.has(normalizeRoadName(s.name))),
    steps: relevant.map((s) => ({ name: s.name || null, ref: s.ref || null, distanceM: s.distanceM })),
    distanceM: relevant.reduce((sum, s) => sum + (Number.isFinite(s.distanceM) ? s.distanceM : 0), 0),
  }
}

// ── Alangilan corridor configuration (generator input) ─────────────────────
// Lives here so routeChecks.test.ts can check it under tsc; scripts/routes.config.mjs re-exports it.
// - CAMPUS and each `end` must equal LOCATION and the last path point in src/campuses/alangilan.ts.
// - appViaLabel is the app's current `via` label, shown for comparison only. It is not changed here.
// - primaryRoads are matched against OSRM step NAMES only (never refs). Source: ROAD_GROUP_SOURCE.
// - vias: forcing via-points. Empty. Never added or moved automatically; each needs full provenance.
// - approach: a destination snap bearing constraint (affects only where OSRM snaps the destination).
//   It does not guarantee the route's final approach direction.
// - pathEnds: 'partial' when the end point stops before the destination town; otherwise null.
// - auxSnappedEndExcess: also measure the snapped-endpoint loop (auxiliary; can only add a warning).

export const CAMPUS = [13.7842, 121.0744]

// Provenance of the primary road groups. The run it cites is local-only: its GeoJSON output is
// git-ignored and not included in the repository, and its diagnostic report was overwritten by later
// runs. The shares measured from it are recorded in docs/routes/alangilan-review-notes.md.
export const ROAD_GROUP_SOURCE = 'Project team visual inspection of diagnostic run 20261117T052515Z-1b3f27 (2026-11-17). Local-only run: its GeoJSON output is git-ignored and not included in the repository; shares measured from it are recorded in docs/routes/alangilan-review-notes.md'

// Access roads between campus and the first primary road. Public access and actual usability are
// unresolved and require on-site verification.
export const CAMPUS_ACCESS_ROADS = ['Neptune Street', 'Mercury Street']

export const CORRIDORS = [
  {
    id: 'lipa', appViaLabel: 'JP Laurel Hwy', destination: 'Lipa City', end: [13.81, 121.07], pathEnds: 'partial', vias: [],
    primaryRoads: [
      { label: 'Batangas-Balete Road', name: 'Batangas-Balete Road' },
      { label: 'National Highway 4', name: 'National Highway 4' },
    ],
  },
  {
    id: 'batangas', appViaLabel: 'P. Burgos', destination: 'Batangas City proper', end: [13.7575, 121.058], pathEnds: null, vias: [],
    primaryRoads: [
      { label: 'National Highway 4', name: 'National Highway 4' },
      { label: 'P. Burgos Street', name: 'P. Burgos Street' },
    ],
  },
  {
    id: 'bauan', appViaLabel: 'Diversion Rd', destination: 'Bauan / San Pascual', end: [13.79, 121.02], pathEnds: null, vias: [],
    primaryRoads: [
      { label: 'Batangas City–San Pascual–Bauan Bypass Road', name: 'Batangas City–San Pascual–Bauan Bypass Road' },
      { label: 'Aquino Avenue', name: 'Aquino Avenue' },
    ],
  },
  {
    id: 'sanjose', appViaLabel: 'Batangas–Lipa Rd', destination: 'San Jose / Ibaan', end: [13.82, 121.115], pathEnds: null, vias: [],
    primaryRoads: [
      { label: 'STAR Tollway (Southern Tagalog Arterial Road / E2)', name: 'Southern Tagalog Arterial Road' },
    ],
    approach: {
      coordinate: 'end', bearingDeg: 30, rangeDeg: 45,
      // The cited run is local-only: its GeoJSON output is git-ignored and not included in the repository.
      source: 'Northbound STAR carriageway geometry nearest the endpoint in diagnostic run 20261117T052515Z-1b3f27 (13.818842, 121.116483). Local-only run: its GeoJSON output is git-ignored and not included in the repository',
      reason: 'Without it the destination snaps to the southbound carriageway, producing a 4.9 km overshoot and return',
      addedBy: 'BIYAHE project team (planning review)', addedOn: '2026-11-17',
    },
    auxSnappedEndExcess: true,
  },
  {
    id: 'tanauan', appViaLabel: 'STAR Tollway', destination: 'Tanauan / Sto. Tomas', end: [13.85, 121.095], pathEnds: 'partial', vias: [],
    primaryRoads: [
      { label: 'President Jose P. Laurel Highway', name: 'President Jose P. Laurel Highway' },
    ],
  },
]

// ── Wording guard ───────────────────────────────────────────────────────────

const CLAIM = /\b(verified|confirmed|approved|production[- ]ready)\b/gi

// Positive claims that a route is verified / confirmed / approved / production-ready.
// Allowed: directly negated ("not verified", "NOT APPROVED", "never confirmed", "no ... "),
// the field `approved: false` / `"approved": false`, and unchecked checklist lines ("- [ ] ...").
export function findPositiveClaims(text) {
  const claims = []
  String(text).split(/\r?\n/).forEach((line, i) => {
    if (/^\s*[-*]\s*\[ \]/.test(line)) return
    for (const m of line.matchAll(CLAIM)) {
      const before = line.slice(0, m.index)
      if (/\b(not|never|no)\s+$/i.test(before)) continue
      const after = line.slice(m.index + m[0].length)
      if (m[0].toLowerCase() === 'approved' && /^["']?\s*:\s*false\b/.test(after)) continue
      claims.push({ line: i + 1, word: m[0], text: line.trim() })
    }
  })
  return claims
}

// ═══════════════════════════════════════════════════════════════════════════
// Approval validation (Phase 2). Pure functions only: no filesystem, no Git, no network. The
// approval script and the build-time checks collect files and Git state and pass them in.
// ═══════════════════════════════════════════════════════════════════════════

// ── SHA-256, record hashes and application path hashing ─────────────────────
// Implemented in routeHash.js (browser-safe, also used by the app) and re-exported here unchanged.
export { buildAppPath, geojsonSha256, recordSha256, routeGeometryHash, serializeAppPath, sha256Hex } from './routeHash.js'

// ── Warning rules ───────────────────────────────────────────────────────────
// Value shapes belong to the warning schema (WARNING_SCHEMA_VERSION) and are defined here with the value
// checks. Which evidence may resolve each warning, and which warnings need the shared campus-exit
// evidence or an endpoint relationship, is approval policy read from APPROVAL_SCHEMA_PARAMS
// (APPROVAL_SCHEMA_VERSION); nothing in this section restates that policy.

const isNonNegNumber = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isLatLngValue = (v) => Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'number' && Number.isFinite(x))

const WARNING_VALUE_SHAPES = {
  'campus-exit-unverified': 'object { distanceM: number >= 0, roads: non-empty string[] }',
  'destination-overshoot': 'metres (number >= 0)',
  'endpoint-zone-not-reached': 'metres: endpoint zone radius (number >= 0)',
  'endpoint-snap': 'metres (number >= 0)',
  'start-snap': 'metres (number >= 0)',
  'snap-bearing-applied': 'object { bearingDeg: number, rangeDeg: number }',
  'snapped-endpoint-loop': 'metres (number >= 0)',
  'connector-long': 'metres (number >= 0)',
  'near-straight': 'ratio (number >= 0)',
  'weak-road-evidence': 'share 0–1 (number)',
}

export const WARNING_CODES = Object.freeze([...WARNING_SCHEMA_PARAMS.codes])
export const ENDPOINT_WARNING_CODES = APPROVAL_SCHEMA_PARAMS.endpointWarnings.codes

// Fail closed at load time if the warning schema and approval policy ever disagree on the codes.
for (const code of WARNING_CODES) {
  if (!WARNING_VALUE_SHAPES[code]) throw new Error(`No value shape for warning code ${code}`)
  if (!APPROVAL_SCHEMA_PARAMS.evidenceResolution[code]) throw new Error(`No evidence-resolution policy for warning code ${code}`)
}

export const WARNING_RULES = Object.freeze(Object.fromEntries(WARNING_CODES.map((code) => [code, Object.freeze({
  value: WARNING_VALUE_SHAPES[code],
  evidenceTypes: APPROVAL_SCHEMA_PARAMS.evidenceResolution[code],
  sharedEvidence: code === APPROVAL_SCHEMA_PARAMS.campusExit.warningCode,
  endpointRelationship: APPROVAL_SCHEMA_PARAMS.endpointWarnings.codes.includes(code),
})])))

const VALUE_CHECKS = {
  'campus-exit-unverified': (v) => v && typeof v === 'object' && isNonNegNumber(v.distanceM)
    && Array.isArray(v.roads) && v.roads.length > 0 && v.roads.every((r) => typeof r === 'string' && r.trim() !== ''),
  'snap-bearing-applied': (v) => v && typeof v === 'object' && Number.isFinite(v.bearingDeg) && Number.isFinite(v.rangeDeg),
  'weak-road-evidence': (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1,
}

// Structure of one warning. Returns a list of problems (empty = valid).
export function validateWarning(w, where = 'warning') {
  const problems = []
  if (!w || typeof w !== 'object') return [`${where}: not an object`]
  const keys = Object.keys(w).sort().join(',')
  if (keys !== 'code,text,value') problems.push(`${where}: must have exactly the fields code, text, value (found ${keys || 'none'})`)
  if (!WARNING_CODES.includes(w.code)) problems.push(`${where}: unknown warning code ${JSON.stringify(w.code)}`)
  if (typeof w.text !== 'string' || w.text.trim() === '') problems.push(`${where}: text must be a non-empty string`)
  if (WARNING_CODES.includes(w.code)) {
    const check = VALUE_CHECKS[w.code] ?? isNonNegNumber
    if (!check(w.value)) problems.push(`${where}: value does not match the shape for ${w.code} (${WARNING_RULES[w.code].value})`)
  }
  return problems
}

// A route's warning list: each valid, and each code at most once (no code may repeat on one route).
export function validateWarningList(warnings, where = 'warnings') {
  if (!Array.isArray(warnings)) return [`${where}: must be an array`]
  const problems = warnings.flatMap((w, i) => validateWarning(w, `${where}[${i}]`))
  const seen = new Set()
  for (const w of warnings) {
    if (w && seen.has(w.code)) problems.push(`${where}: duplicate warning code ${w.code}`)
    if (w) seen.add(w.code)
  }
  return problems
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── Shared campus-exit evidence ─────────────────────────────────────────────

const ROUTE_IDS = Object.freeze(['lipa', 'batangas', 'bauan', 'sanjose', 'tanauan'])
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== ''

// Classifies an evidence reference without any network or filesystem access:
//   { kind: 'https', verification: 'structural-only' } — a well-formed https:// URL with a host. Its content has
//     NOT been fetched or verified; reviewers must open it.
//   { kind: 'repo', verification: 'committed-file' } — a normalized repo-relative path under an allowed
//     evidence prefix (APPROVAL_SCHEMA_PARAMS.evidenceRefPrefixes) and present in `committedFiles` (tracked and
//     unmodified). The caller verifies the committed blob bytes.
//   { kind: 'invalid', problem } — anything else (local paths, ~, UNC, file:, http:, .., paths outside the
//     allowed prefixes, uncommitted files).
export function classifyEvidenceRef(ref, committedFiles) {
  const invalid = (problem) => ({ kind: 'invalid', problem })
  if (!nonEmpty(ref)) return invalid('evidence reference must be a non-empty string')
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) && !/^[a-z]:[\\/]/i.test(ref)) {
    let url
    try { url = new URL(ref) } catch { return invalid(`invalid URL ${ref}`) }
    return url.protocol === 'https:' && url.hostname
      ? { kind: 'https', verification: 'structural-only' }
      : invalid(`only https:// URLs are accepted (${ref})`)
  }
  if (/^[a-z]:[\\/]/i.test(ref) || ref.startsWith('/') || ref.startsWith('\\') || ref.startsWith('~') || ref.includes('\\')) {
    return invalid(`local machine path is not reviewer-accessible (${ref})`)
  }
  if (ref.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return invalid(`path must be a normalized repo-relative path (${ref})`)
  const prefixes = APPROVAL_SCHEMA_PARAMS.evidenceRefPrefixes
  if (!prefixes.some((p) => ref.startsWith(p))) return invalid(`${ref} is outside the allowed evidence paths (${prefixes.join(', ')})`)
  if (!committedFiles) return invalid(`cannot confirm ${ref} is a committed repository file (no committed file list supplied)`)
  return committedFiles.has(ref) ? { kind: 'repo', verification: 'committed-file' } : invalid(`${ref} is not a committed repository file`)
}

// An evidence reference reviewers can open: an https:// URL, or a repo-relative path to a committed file
// (present in `committedFiles`). Local machine paths are never accepted. Returns a problem or null.
export function checkEvidenceRef(ref, committedFiles) {
  const c = classifyEvidenceRef(ref, committedFiles)
  return c.kind === 'invalid' ? c.problem : null
}

// Validates the shared campus-exit evidence record. `accepting` is true only when public access is
// public / public-with-conditions AND usability is usable / usable-with-conditions.
export function validateSharedEvidence(ev, { committedFiles } = {}) {
  const problems = []
  const ce = APPROVAL_SCHEMA_PARAMS.campusExit
  if (!ev || typeof ev !== 'object') return { valid: false, accepting: false, problems: ['evidence: not an object'] }
  for (const f of unknownKeys(ev, FIELDS.evidence)) problems.push(`evidence: unknown field ${f}`)
  if (ev.approvalSchemaVersion !== APPROVAL_SCHEMA_VERSION) problems.push(`evidence: approvalSchemaVersion must be ${APPROVAL_SCHEMA_VERSION}`)
  if (!nonEmpty(ev.evidenceId) || !/^[a-z0-9][a-z0-9-]*$/.test(ev.evidenceId)) problems.push('evidence: evidenceId must be a lowercase identifier')
  if (ev.evidenceType !== ce.evidenceType) problems.push(`evidence: evidenceType must be ${ce.evidenceType}`)
  if (!nonEmpty(ev.subject)) problems.push('evidence: subject is required')
  if (!Array.isArray(ev.segmentsInspected) || ev.segmentsInspected.length === 0 || !ev.segmentsInspected.every(nonEmpty)) {
    problems.push('evidence: segmentsInspected must list the inspected road segments')
  }
  if (!isDate(ev.inspectedOn)) problems.push('evidence: inspectedOn must be a YYYY-MM-DD date')
  if (!nonEmpty(ev.inspectedBy)) problems.push('evidence: inspectedBy is required')
  const finding = (key, statuses) => {
    const f = ev[key]
    if (!f || typeof f !== 'object') { problems.push(`evidence: ${key} is required`); return }
    const allowed = [...FIELDS.evidenceFinding.required, ...FIELDS.evidenceFinding.optional]
    for (const k of unknownKeys(f, allowed)) problems.push(`evidence: ${key} has unknown field ${k}`)
    if (!statuses.includes(f.status)) problems.push(`evidence: ${key}.status must be one of ${statuses.join(', ')}`)
    if (!nonEmpty(f.finding)) problems.push(`evidence: ${key}.finding is required`)
    if (ce.conditionsRequiredFor[key].includes(f.status) && !nonEmpty(f.conditions)) {
      problems.push(`evidence: ${key}.conditions are required when the status is ${f.status}`)
    }
  }
  finding('publicAccess', ce.publicAccessStatuses)
  finding('usability', ce.usabilityStatuses)
  if (!Array.isArray(ev.evidenceRefs) || ev.evidenceRefs.length === 0) problems.push('evidence: evidenceRefs must list at least one reference')
  else for (const ref of ev.evidenceRefs) { const p = checkEvidenceRef(ref, committedFiles); if (p) problems.push(`evidence: ${p}`) }
  if (!Array.isArray(ev.appliesToRoutes) || ev.appliesToRoutes.length === 0) problems.push('evidence: appliesToRoutes must list routes')
  else {
    for (const id of ev.appliesToRoutes) if (!ROUTE_IDS.includes(id)) problems.push(`evidence: appliesToRoutes has unknown route ${id}`)
    if (new Set(ev.appliesToRoutes).size !== ev.appliesToRoutes.length) problems.push('evidence: appliesToRoutes has duplicates')
  }
  if (typeof ev.limitations !== 'string') problems.push('evidence: limitations must be a string (may be empty)')
  const accepting = problems.length === 0
    && ce.publicAccessAccepted.includes(ev.publicAccess.status) && ce.usabilityAccepted.includes(ev.usability.status)
  return { valid: problems.length === 0, accepting, problems }
}

// Conditions from the evidence that every accepting route resolution must repeat.
export const evidenceConditions = (ev) => ({
  publicAccess: ev?.publicAccess?.conditions ?? null,
  usability: ev?.usability?.conditions ?? null,
})

// ── Route approval record ───────────────────────────────────────────────────

// Field sets come from the pinned approval schema (as-1).
const FIELDS = APPROVAL_SCHEMA_PARAMS.fields
const RECORD_FIELDS = FIELDS.record
const RESOLUTION_FIELDS = FIELDS.resolution.required
const RESOLUTION_ALLOWED = [...FIELDS.resolution.required, ...FIELDS.resolution.optional]

// Names of keys in `obj` that are not in `allowed` (own enumerable keys only).
const unknownKeys = (obj, allowed) => Object.keys(obj).filter((k) => !allowed.includes(k))
const isHash = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)
const CURRENT_OUTCOMES = ['accepted-limitation', 'unresolved']
const ENDPOINT_SEPARATION_TOLERANCE_M = 1

// Validates one route record.
// ctx: {
//   routeId, config: { end, pathEnds },            — from CORRIDORS
//   sharedEvidence, sharedEvidenceResult,          — the evidence record and validateSharedEvidence() result
//   committedFiles,                                 — Set of committed repo paths (for evidenceRef checks)
//   run: null | { runId, geojsonSha256, versions, status, warnings, routeGeometrySha256, snappedEnd }  — local mode only
// }
// Returns { valid, activatable, problems, blockers }. `blockers` are valid-but-blocking items
// (unresolved outcomes, non-accepting evidence); `problems` are schema or consistency errors.
export function validateApprovalRecord(rec, ctx) {
  const problems = []
  const blockers = []
  const where = `record ${ctx.routeId}`
  if (!rec || typeof rec !== 'object') return { valid: false, activatable: false, problems: [`${where}: not an object`], blockers }
  for (const f of RECORD_FIELDS) if (!(f in rec)) problems.push(`${where}: missing field ${f}`)
  for (const f of Object.keys(rec)) if (!RECORD_FIELDS.includes(f)) problems.push(`${where}: unknown field ${f}`)
  if (rec.routeId !== ctx.routeId) problems.push(`${where}: routeId is ${JSON.stringify(rec.routeId)}, expected ${ctx.routeId}`)
  if (rec.campus !== 'alangilan') problems.push(`${where}: campus must be alangilan`)
  for (const k of incompatibleVersionKeys(rec, VERSIONS)) problems.push(`${where}: ${k} ${JSON.stringify(rec[k])} is not compatible with the current ${VERSIONS[k]}`)
  if (!nonEmpty(rec.runId)) problems.push(`${where}: runId is required`)
  if (!isHash(rec.geojsonSha256)) problems.push(`${where}: geojsonSha256 must be a SHA-256 hex digest`)
  if (!isHash(rec.routeGeometrySha256)) problems.push(`${where}: routeGeometrySha256 must be a SHA-256 hex digest`)
  if (rec.pathEnds !== ctx.config.pathEnds) problems.push(`${where}: pathEnds ${JSON.stringify(rec.pathEnds)} does not match the configured ${JSON.stringify(ctx.config.pathEnds)}`)
  if (!nonEmpty(rec.reviewedBy)) problems.push(`${where}: reviewedBy is required`)
  if (!isDate(rec.reviewedOn)) problems.push(`${where}: reviewedOn must be a YYYY-MM-DD date`)

  // Local mode: the record must match the diagnostic run exactly.
  const run = ctx.run
  if (run) {
    if (run.status === 'FAILED') problems.push(`${where}: the diagnostic run reports this route as FAILED; a FAILED route cannot be approved`)
    if (rec.runId !== run.runId) problems.push(`${where}: runId ${rec.runId} does not match the diagnostic run ${run.runId}`)
    if (rec.geojsonSha256 !== run.geojsonSha256) problems.push(`${where}: geojsonSha256 does not match the diagnostic GeoJSON`)
    if (rec.routeGeometrySha256 !== run.routeGeometrySha256) problems.push(`${where}: routeGeometrySha256 does not match the geometry reproduced from the run`)
    for (const k of incompatibleVersionKeys(rec, run.versions)) problems.push(`${where}: ${k} differs from the diagnostic run`)
  }

  // Warnings: structurally valid, unique, and (local mode) copied verbatim from the run.
  const warnings = Array.isArray(rec.warnings) ? rec.warnings : []
  problems.push(...validateWarningList(rec.warnings, `${where} warnings`))
  if (run) {
    const runByCode = new Map((run.warnings ?? []).map((w) => [w.code, w]))
    const recByCode = new Map(warnings.map((w) => [w?.code, w]))
    for (const [code, w] of runByCode) {
      if (!recByCode.has(code)) problems.push(`${where}: warning ${code} from the diagnostic run is missing`)
      else if (!sameJson(recByCode.get(code), w)) problems.push(`${where}: warning ${code} is not copied verbatim from the diagnostic run`)
    }
    for (const code of recByCode.keys()) if (!runByCode.has(code)) problems.push(`${where}: warning ${code} is not reported by the diagnostic run`)
  }

  // Resolutions: exactly one per current warning.
  const resolutions = Array.isArray(rec.resolutions) ? rec.resolutions : []
  if (!Array.isArray(rec.resolutions)) problems.push(`${where}: resolutions must be an array`)
  const warningCodes = new Set(warnings.map((w) => w?.code))
  const resolvedCodes = new Map()
  resolutions.forEach((r, i) => {
    const rw = `${where} resolution[${i}]`
    if (!r || typeof r !== 'object') { problems.push(`${rw}: not an object`); return }
    for (const f of RESOLUTION_FIELDS) if (!(f in r)) problems.push(`${rw}: missing field ${f}`)
    for (const f of unknownKeys(r, RESOLUTION_ALLOWED)) problems.push(`${rw}: unknown field ${f}`)
    if ('conditionsAcknowledged' in r && r.conditionsAcknowledged !== null && typeof r.conditionsAcknowledged === 'object') {
      for (const f of unknownKeys(r.conditionsAcknowledged, FIELDS.conditionsAcknowledged)) problems.push(`${rw}: conditionsAcknowledged has unknown field ${f}`)
    }
    if (r.endpointRelationship && typeof r.endpointRelationship === 'object') {
      for (const f of unknownKeys(r.endpointRelationship, FIELDS.endpointRelationship)) problems.push(`${rw}: endpointRelationship has unknown field ${f}`)
    }
    if (resolvedCodes.has(r.warningCode)) problems.push(`${where}: more than one resolution for ${r.warningCode}`)
    resolvedCodes.set(r.warningCode, r)
    if (!warningCodes.has(r.warningCode)) problems.push(`${rw}: resolves ${JSON.stringify(r.warningCode)}, which is not a current warning on this record`)
    const rule = WARNING_RULES[r.warningCode]
    if (r.outcome === 'corrected') problems.push(`${rw}: a current warning cannot be marked corrected (corrected is only allowed in history)`)
    else if (!CURRENT_OUTCOMES.includes(r.outcome)) problems.push(`${rw}: outcome must be accepted-limitation or unresolved`)
    if (!nonEmpty(r.resolution)) problems.push(`${rw}: resolution description is required`)
    if ('evidenceRef' in r) {
      const refProblem = checkEvidenceRef(r.evidenceRef, ctx.committedFiles)
      if (refProblem) problems.push(`${rw}: evidenceRef: ${refProblem}`)
    }
    if (!nonEmpty(r.reviewer)) problems.push(`${rw}: reviewer is required`)
    if (!isDate(r.reviewedOn)) problems.push(`${rw}: reviewedOn must be a YYYY-MM-DD date`)
    if (!APPROVAL_SCHEMA_PARAMS.evidenceTypes.includes(r.evidenceType)) problems.push(`${rw}: unknown evidenceType ${JSON.stringify(r.evidenceType)}`)
    else if (rule && !rule.evidenceTypes.includes(r.evidenceType)) problems.push(`${rw}: evidenceType ${r.evidenceType} cannot resolve ${r.warningCode} (allowed: ${rule.evidenceTypes.join(', ')})`)
    if (r.runId !== rec.runId) problems.push(`${rw}: runId does not match the record`)
    if (r.routeGeometrySha256 !== rec.routeGeometrySha256) problems.push(`${rw}: routeGeometrySha256 does not match the record`)
    if (r.outcome === 'unresolved') blockers.push(`${where}: ${r.warningCode} is unresolved`)

    if (rule?.sharedEvidence) {
      // Campus exit: only through the shared on-site evidence record.
      const ev = ctx.sharedEvidence
      if (!nonEmpty(r.sharedEvidenceId)) problems.push(`${rw}: campus-exit resolution must reference the shared evidence record (sharedEvidenceId)`)
      else if (!ev || r.sharedEvidenceId !== ev.evidenceId) problems.push(`${rw}: sharedEvidenceId ${r.sharedEvidenceId} does not match the shared evidence record`)
      if (ev && !(ev.appliesToRoutes ?? []).includes(rec.routeId)) problems.push(`${rw}: the shared evidence does not list ${rec.routeId} in appliesToRoutes`)
      const w = warnings.find((x) => x?.code === r.warningCode)
      const inspected = new Set((ev?.segmentsInspected ?? []).map(normalizeRoadName))
      for (const road of w?.value?.roads ?? []) {
        if (!inspected.has(normalizeRoadName(road))) problems.push(`${rw}: the shared evidence does not cover segment "${road}"`)
      }
      const evResult = ctx.sharedEvidenceResult
      if (r.outcome === 'accepted-limitation') {
        if (!evResult?.valid) problems.push(`${rw}: the shared evidence record is not valid`)
        else if (!evResult.accepting) problems.push(`${rw}: the shared evidence does not establish public access and usability; the outcome must stay unresolved`)
        if (!sameJson(r.conditionsAcknowledged ?? null, evidenceConditions(ev))) {
          problems.push(`${rw}: conditionsAcknowledged must repeat the evidence conditions exactly`)
        }
      }
    } else if ('sharedEvidenceId' in r) {
      problems.push(`${rw}: only the campus-exit warning may reference the shared evidence`)
    }

    if (rule?.endpointRelationship && r.outcome === 'accepted-limitation') {
      // Endpoint warnings: the requested → accepted endpoint relationship must be explained and consistent.
      const er = r.endpointRelationship
      if (!er || typeof er !== 'object') problems.push(`${rw}: endpointRelationship is required for ${r.warningCode}`)
      else {
        if (!isLatLngValue(er.requestedEndpoint) || !samePoint(er.requestedEndpoint, ctx.config.end)) {
          problems.push(`${rw}: requestedEndpoint must equal the configured endpoint ${JSON.stringify(ctx.config.end)} (a different intended destination needs a config change and a new run)`)
        }
        if (!isLatLngValue(er.acceptedEndpoint)) problems.push(`${rw}: acceptedEndpoint must be [lat, lng]`)
        else if (run && !(isLatLngValue(run.snappedEnd) && samePoint(er.acceptedEndpoint, run.snappedEnd))) {
          problems.push(`${rw}: acceptedEndpoint does not match the snapped endpoint in the diagnostic run`)
        }
        if (isLatLngValue(er.requestedEndpoint) && isLatLngValue(er.acceptedEndpoint)) {
          const d = haversineM(er.requestedEndpoint, er.acceptedEndpoint)
          if (!(typeof er.separationM === 'number' && Math.abs(er.separationM - d) <= ENDPOINT_SEPARATION_TOLERANCE_M)) {
            problems.push(`${rw}: separationM ${er.separationM} does not match the measured ${d.toFixed(1)} m`)
          }
        }
        if (!nonEmpty(er.intendedDestination)) problems.push(`${rw}: endpointRelationship.intendedDestination is required`)
        if (!nonEmpty(er.relationship)) problems.push(`${rw}: endpointRelationship.relationship must explain why the accepted endpoint serves the intended destination`)
      }
    }
  })
  for (const code of warningCodes) if (code && !resolvedCodes.has(code)) problems.push(`${where}: warning ${code} has no resolution`)

  // History: corrected warnings from earlier runs, each tied to a documented configuration change.
  if (!Array.isArray(rec.history)) problems.push(`${where}: history must be an array (may be empty)`)
  else rec.history.forEach((h, i) => {
    const hw = `${where} history[${i}]`
    if (!h || typeof h !== 'object') { problems.push(`${hw}: not an object`); return }
    for (const f of unknownKeys(h, FIELDS.history)) problems.push(`${hw}: unknown field ${f}`)
    if (h.outcome !== 'corrected') problems.push(`${hw}: history entries must have outcome corrected`)
    if (!nonEmpty(h.runId) || h.runId === rec.runId) problems.push(`${hw}: must reference an earlier run, not the current one`)
    problems.push(...validateWarning(h.warning, `${hw} warning`))
    if (!nonEmpty(h.configChange)) problems.push(`${hw}: configChange must document the configuration change that removed the warning`)
    if (!nonEmpty(h.resolution)) problems.push(`${hw}: resolution description is required`)
    if (!nonEmpty(h.reviewer)) problems.push(`${hw}: reviewer is required`)
    if (!isDate(h.reviewedOn)) problems.push(`${hw}: reviewedOn must be a YYYY-MM-DD date`)
  })

  return { valid: problems.length === 0, activatable: problems.length === 0 && blockers.length === 0, problems, blockers }
}

// ── Full set ────────────────────────────────────────────────────────────────

export const APPROVAL_MODES = Object.freeze({ local: 'local-diagnostic-run', committed: 'committed-records-only' })

// What committed-records-only mode cannot check, because the diagnostic GeoJSON is not available.
export const NOT_VERIFIED_IN_COMMITTED_MODE = Object.freeze([
  'the diagnostic GeoJSON bytes (geojsonSha256) — not rehashed',
  'that warnings were copied verbatim from the diagnostic run',
  'that routeGeometrySha256 matches geometry reproduced from the raw OSRM geometry',
  'that accepted endpoints equal the snapped endpoints in the run',
  'the run status (FAILED routes)',
])

// Validates the complete approval set.
// opts: { records, evidence, corridors, committedFiles, mode: 'local' | 'committed', run? }
// run (local mode only): { runId, geojsonSha256, versions, routes: { [id]: { status, warnings, routeGeometrySha256, snappedEnd } } }
export function validateApprovalSet({ records, evidence, corridors, committedFiles, mode, run }) {
  const problems = []
  const blockers = []
  if (mode !== 'local' && mode !== 'committed') throw new TypeError("mode must be 'local' or 'committed'")
  if (mode === 'local' && !run) problems.push('local mode needs the diagnostic run (GeoJSON-derived data)')
  if (mode === 'committed' && run) throw new TypeError('committed mode must not be given diagnostic run data')

  const expectedIds = corridors.map((c) => c.id)
  if (expectedIds.length !== APPROVAL_SCHEMA_PARAMS.requiredRouteCount) problems.push(`expected ${APPROVAL_SCHEMA_PARAMS.requiredRouteCount} configured routes, found ${expectedIds.length}`)
  const list = Array.isArray(records) ? records : []
  const byId = new Map()
  for (const r of list) {
    const id = r?.routeId
    if (byId.has(id)) problems.push(`duplicate record for route ${id}`)
    byId.set(id, r)
  }
  for (const id of expectedIds) if (!byId.has(id)) problems.push(`missing record for route ${id}`)
  for (const id of byId.keys()) if (!expectedIds.includes(id)) problems.push(`unexpected record for route ${JSON.stringify(id)}`)

  const runIds = new Set(list.map((r) => r?.runId))
  if (runIds.size > 1) problems.push(`records cite more than one diagnostic run: ${[...runIds].join(', ')}`)
  const geoHashes = new Set(list.map((r) => r?.geojsonSha256))
  if (geoHashes.size > 1) problems.push('records cite more than one diagnostic GeoJSON hash')
  if (mode === 'local' && run) {
    for (const k of incompatibleVersionKeys(run.versions, VERSIONS)) problems.push(`the diagnostic run's ${k} is not compatible with the current code`)
  }

  const evidenceResult = validateSharedEvidence(evidence, { committedFiles })
  // The shared evidence is validated whenever it is supplied (an invalid evidence file fails even if no current
  // warning relies on it), and whenever any record needs it.
  const needsEvidence = list.some((r) => (r?.warnings ?? []).some((w) => w?.code === 'campus-exit-unverified'))
  if (needsEvidence || (evidence !== undefined && evidence !== null)) {
    problems.push(...evidenceResult.problems)
    if (evidenceResult.valid && !evidenceResult.accepting) blockers.push('shared campus-exit evidence does not establish public access and usability')
  }

  for (const c of corridors) {
    const rec = byId.get(c.id)
    if (!rec) continue
    const routeRun = mode === 'local' && run ? (() => {
      const rr = run.routes?.[c.id]
      return rr ? { runId: run.runId, geojsonSha256: run.geojsonSha256, versions: run.versions, ...rr } : { runId: run.runId, missing: true }
    })() : null
    if (routeRun?.missing) { problems.push(`the diagnostic run has no data for route ${c.id}`); continue }
    const r = validateApprovalRecord(rec, {
      routeId: c.id, config: { end: c.end, pathEnds: c.pathEnds ?? null },
      sharedEvidence: evidence, sharedEvidenceResult: evidenceResult, committedFiles, run: routeRun,
    })
    problems.push(...r.problems)
    blockers.push(...r.blockers)
  }

  return {
    mode: mode === 'local' ? APPROVAL_MODES.local : APPROVAL_MODES.committed,
    valid: problems.length === 0,
    activatable: problems.length === 0 && blockers.length === 0,
    problems,
    blockers,
    notVerified: mode === 'committed' ? [...NOT_VERIFIED_IN_COMMITTED_MODE] : [],
  }
}

// ── Git state (pure) ────────────────────────────────────────────────────────
// The approval script collects `git ls-files` and `git status --porcelain=v1 --untracked-files=all`
// output and passes it here; this module never runs Git or touches the filesystem.

// Paths mentioned in porcelain v1 output, with their two-letter status.
export function parsePorcelain(porcelain) {
  return String(porcelain).split(/\r?\n/).filter((l) => l.length > 3).map((l) => {
    const status = l.slice(0, 2)
    let path = l.slice(3)
    if (path.includes(' -> ')) path = path.split(' -> ')[1]
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1)
    return { status, path: path.replace(/\\/g, '/') }
  })
}

// Paths in `git status --porcelain=v1 -z` output: NUL-separated "XY path" entries; for renames and copies
// (R or C in either column) the next entry is the original path, which is skipped. No quoting or escaping
// applies in -z mode, so paths are exact.
export function parsePorcelainZ(porcelainZ) {
  const parts = String(porcelainZ).split('\0')
  const out = []
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (entry.length < 4) continue
    const status = entry.slice(0, 2)
    out.push({ status, path: entry.slice(3) })
    if (status.includes('R') || status.includes('C')) i++
  }
  return out
}

// Every required path must be tracked and have no staged, unstaged or untracked change.
// The snapshot carries either `porcelain` (newline format) or `porcelainZ` (-z format, preferred).
export function validateCleanTracked({ trackedFiles, porcelain, porcelainZ }, requiredPaths) {
  const tracked = new Set([...trackedFiles].map((p) => p.replace(/\\/g, '/')))
  const changes = porcelainZ !== undefined ? parsePorcelainZ(porcelainZ) : parsePorcelain(porcelain ?? '')
  const problems = []
  for (const p of requiredPaths) {
    const path = p.replace(/\\/g, '/')
    const change = changes.find((c) => c.path === path)
    if (change?.status === '??') problems.push(`${path} is untracked`)
    else if (!tracked.has(path)) problems.push(`${path} is not tracked by Git`)
    if (change && change.status !== '??') {
      const [x, y] = change.status
      if (x !== ' ') problems.push(`${path} has staged changes (${change.status})`)
      if (y !== ' ') problems.push(`${path} has unstaged changes (${change.status})`)
    }
  }
  return { clean: problems.length === 0, problems }
}

// ── Strict JSON (approval records and evidence) ─────────────────────────────

const STRICT_JSON_MAX_DEPTH = 256
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }
const NUMBER_RE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

// RFC 8259 JSON parser that also rejects duplicate object keys at any depth (compared after unescaping, so
// "a" and "a" are duplicates). Rejects trailing commas, comments, single quotes, NaN/Infinity, leading
// zeros, raw control characters in strings and trailing content; limits nesting depth. Keys are stored as
// own data properties (so "__proto__" is an ordinary key, as with JSON.parse). Errors give line and column.
export function parseStrictJson(text, { maxDepth = STRICT_JSON_MAX_DEPTH } = {}) {
  if (typeof text !== 'string') throw new TypeError('parseStrictJson expects a string')
  let i = 0
  const fail = (message) => {
    const before = text.slice(0, i)
    const line = before.split('\n').length
    const column = i - before.lastIndexOf('\n')
    throw new SyntaxError(`${message} at line ${line}, column ${column}`)
  }
  const skipWs = () => {
    while (i < text.length) {
      const c = text.charCodeAt(i)
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++
      else break
    }
  }
  const parseString = () => {
    i++ // opening quote
    let out = ''
    for (;;) {
      if (i >= text.length) fail('Unterminated string')
      const c = text.charCodeAt(i)
      if (c === 0x22) { i++; return out }
      if (c < 0x20) fail('Unescaped control character in string')
      if (c === 0x5c) {
        const e = text[i + 1]
        if (e === 'u') {
          const hex = text.slice(i + 2, i + 6)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('Invalid \\u escape')
          out += String.fromCharCode(parseInt(hex, 16))
          i += 6
        } else if (e !== undefined && Object.prototype.hasOwnProperty.call(ESCAPES, e)) {
          out += ESCAPES[e]
          i += 2
        } else {
          fail('Invalid escape sequence')
        }
      } else {
        out += text[i]
        i++
      }
    }
  }
  const parseValue = (depth) => {
    if (depth > maxDepth) fail(`Nesting deeper than ${maxDepth}`)
    skipWs()
    const ch = text[i]
    if (ch === '{') {
      i++
      const obj = {}
      const keys = new Set()
      skipWs()
      if (text[i] === '}') { i++; return obj }
      for (;;) {
        skipWs()
        if (text[i] !== '"') fail(text[i] === '}' ? 'Trailing comma in object' : 'Expected a string key')
        const keyAt = i
        const key = parseString()
        if (keys.has(key)) { i = keyAt; fail(`Duplicate key ${JSON.stringify(key)}`) }
        keys.add(key)
        skipWs()
        if (text[i] !== ':') fail('Expected ":"')
        i++
        const v = parseValue(depth + 1)
        Object.defineProperty(obj, key, { value: v, writable: true, enumerable: true, configurable: true })
        skipWs()
        if (text[i] === ',') { i++; continue }
        if (text[i] === '}') { i++; return obj }
        fail('Expected "," or "}"')
      }
    }
    if (ch === '[') {
      i++
      const arr = []
      skipWs()
      if (text[i] === ']') { i++; return arr }
      for (;;) {
        skipWs()
        if (text[i] === ']') fail('Trailing comma in array')
        arr.push(parseValue(depth + 1))
        skipWs()
        if (text[i] === ',') { i++; continue }
        if (text[i] === ']') { i++; return arr }
        fail('Expected "," or "]"')
      }
    }
    if (ch === '"') return parseString()
    if (text.startsWith('true', i)) { i += 4; return true }
    if (text.startsWith('false', i)) { i += 5; return false }
    if (text.startsWith('null', i)) { i += 4; return null }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      NUMBER_RE.lastIndex = i
      const m = NUMBER_RE.exec(text)
      if (!m) fail('Invalid number')
      i += m[0].length
      const next = text[i]
      if (next !== undefined && /[0-9.eE+-]/.test(next)) fail('Invalid number')
      return Number(m[0])
    }
    if (ch === undefined) fail('Unexpected end of input')
    return fail(`Unexpected character ${JSON.stringify(ch)}`)
  }
  const value = parseValue(0)
  skipWs()
  if (i !== text.length) fail('Unexpected trailing content')
  return value
}

// ── Geometry processing (gp-1), shared by the generator and the approval script ──

// OSRM GeoJSON positions [lon, lat] → the stored road path: convert to [lat, lng], Douglas–Peucker
// simplification, rounding, consecutive-duplicate removal (GEOMETRY_PROCESSING_PARAMS). The campus point
// is NOT included; buildAppPath() prepends it.
export function processRoadPath(rawLonLat) {
  if (!Array.isArray(rawLonLat) || rawLonLat.length < 2) throw new TypeError('processRoadPath needs at least 2 positions')
  const raw = rawLonLat.map(osrmToLatLng)
  return dedupeConsecutive(simplify(raw, GEOMETRY_PROCESSING_PARAMS.simplification.toleranceM)
    .map((p) => roundLatLng(p, GEOMETRY_PROCESSING_PARAMS.precision.decimals)))
}

// ── Diagnostic run extraction ───────────────────────────────────────────────

const VERSION_KEYS = ['routingPolicyVersion', 'geometryProcessingVersion', 'warningSchemaVersion', 'approvalSchemaVersion', 'generatorVersion']

// Reads the run data that local-mode approval validation needs from a parsed diagnostic GeoJSON.
// Returns { run, problems }. `run` is null when the file lacks the structure the current generator writes
// (for example an older run without versions, structured warnings or geometry hashes).
// run: { runId, geojsonSha256, versions, routes: { [id]: { status, warnings, routeGeometrySha256,
//        snappedEnd, rawLonLat, simplifiedPath } } }
// Options: `allowedStatuses` — when given, every route's stored status must be one of them.
export function extractRunFromGeoJSON(geo, geojsonHash, corridorIds, { allowedStatuses } = {}) {
  const problems = []
  if (!geo || typeof geo !== 'object' || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) {
    return { run: null, problems: ['GeoJSON is not a FeatureCollection'] }
  }
  const meta = geo.biyahe
  if (!meta || typeof meta !== 'object') problems.push('GeoJSON has no biyahe metadata')
  if (meta?.diagnosticSchemaVersion !== DIAG_SCHEMA_VERSION) {
    problems.push(`GeoJSON diagnosticSchemaVersion is ${JSON.stringify(meta?.diagnosticSchemaVersion ?? null)}, expected ${DIAG_SCHEMA_VERSION} (older diagnostics lack the exact data needed to re-run the analysis; regenerate)`)
  }
  const runId = meta?.runId
  if (!nonEmpty(runId)) problems.push('GeoJSON biyahe.runId is missing')
  const versions = meta?.versions
  if (!versions || typeof versions !== 'object' || VERSION_KEYS.some((k) => !nonEmpty(versions[k]))) {
    problems.push('GeoJSON biyahe.versions is missing or incomplete (a run from before versioned output cannot be approved)')
  }
  const routes = {}
  for (const id of corridorIds) {
    const of = (kind) => geo.features.filter((f) => f?.properties?.corridorId === id && f?.properties?.kind === kind)
    const [raw, ...rawExtra] = of('route-raw')
    const [simplified, ...simplifiedExtra] = of('route-simplified')
    const [snappedEnd, ...snappedExtra] = of('snapped-end')
    if (!raw) { problems.push(`${id}: no route-raw feature`); continue }
    if (rawExtra.length || simplifiedExtra.length || snappedExtra.length) problems.push(`${id}: duplicate route features`)
    const p = raw.properties
    if (!nonEmpty(p.validation)) problems.push(`${id}: route-raw has no validation status`)
    else if (allowedStatuses && !allowedStatuses.includes(p.validation)) problems.push(`${id}: unknown status ${JSON.stringify(p.validation)}`)
    if (!Array.isArray(p.warnings)) problems.push(`${id}: route-raw has no structured warnings (older run format)`)
    if (!isHash(p.routeGeometrySha256)) problems.push(`${id}: route-raw has no routeGeometrySha256 (older run format)`)
    if (raw.geometry?.type !== 'LineString' || !Array.isArray(raw.geometry.coordinates)) problems.push(`${id}: route-raw has no LineString geometry`)
    if (!simplified || simplified.geometry?.type !== 'LineString') problems.push(`${id}: no route-simplified geometry`)
    if (!snappedEnd || snappedEnd.geometry?.type !== 'Point') problems.push(`${id}: no snapped-end point`)
    routes[id] = {
      status: p.validation,
      warnings: Array.isArray(p.warnings) ? p.warnings : [],
      routeGeometrySha256: p.routeGeometrySha256,
      snappedEnd: snappedEnd?.geometry?.coordinates ? osrmToLatLng(snappedEnd.geometry.coordinates) : null,
      rawLonLat: raw.geometry?.coordinates ?? [],
      simplifiedPath: simplified?.geometry?.coordinates ? simplified.geometry.coordinates.map(osrmToLatLng) : [],
    }
  }
  if (problems.length) return { run: null, problems }
  return { run: { runId, geojsonSha256: geojsonHash, versions: { ...versions }, routes }, problems }
}
