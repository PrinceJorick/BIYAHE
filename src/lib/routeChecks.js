// Pure route-check functions for the developer-only route generator (scripts/build-routes.mjs).
// Plain ES module JavaScript so the generator can run with plain `node`; types in ./routeChecks.d.ts.
// Unit-tested in ./routeChecks.test.ts, which runs before every generator run. Not used by the app.
//
// Coordinates are BIYAHE LatLng [lat, lng] unless a name says otherwise.

import { haversineM, pathLengthM } from './geo.js'

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
