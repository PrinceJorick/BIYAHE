// Synthetic, in-memory approval fixture shared by the approval-validator and reviewed-road tests. Test-only:
// a valid five-route diagnostic run produced by the real generator from synthetic OSRM responses, plus
// matching approval records and shared evidence. Nothing here is real approval data or real geometry.
import type { LatLng } from '../../src/types'
import { haversineM } from '../../src/lib/geo'
import { CAMPUS, CORRIDORS, evidenceConditions, type ApprovalRecord, type SharedEvidence } from '../../src/lib/routeChecks'
import { VERSIONS } from '../../src/lib/routeVersions'
import * as approve from '../approve-routes.mjs'
import * as gen from '../build-routes.mjs'

export const enc = (s: string) => new TextEncoder().encode(s)
export const ll = (p: LatLng): [number, number] => [p[1], p[0]]
export const RUN_ID = '20261201T000000Z-fixt01'
export const NOTES = 'docs/routes/approvals/evidence/review-notes.md'
export const PHOTOS = 'docs/routes/approvals/evidence/campus-exit-photos.md'
export const PRIMARY: Record<string, string> = {
  lipa: 'Batangas-Balete Road', batangas: 'National Highway 4', bauan: 'Batangas City-San Pascual-Bauan Bypass Road',
  sanjose: 'Southern Tagalog Arterial Road', tanauan: 'President Jose P. Laurel Highway',
}

// A synthetic OSRM response for one corridor: campus access on Neptune Street, then its primary road in short
// steps to a point 3 m from the configured endpoint.
// `endOffsetM` moves the route's end that far from the configured endpoint, perpendicular to the direction of
// travel (used for the San Jose 203 m snapped-endpoint case).
export function osrmBodyFor(id: string, endOffsetM = 0) {
  const c = CORRIDORS.find((x) => x.id === id)!
  const start: LatLng = [13.78419, 121.07428]
  const access: LatLng = [13.782, 121.07]
  let end: LatLng = [c.end[0] + 0.00003, c.end[1]]
  if (endOffsetM) {
    const dir = [c.end[0] - access[0], c.end[1] - access[1]]
    const n0 = Math.hypot(dir[0], dir[1])
    const unit = [-dir[1] / n0, dir[0] / n0]
    const scale = endOffsetM / haversineM(c.end, [c.end[0] + unit[0] * 0.001, c.end[1] + unit[1] * 0.001]) * 0.001
    end = [c.end[0] + unit[0] * scale, c.end[1] + unit[1] * scale]
  }
  const n = 8
  // A small zigzag perpendicular to the direction of travel keeps the path from being collinear (so
  // simplification keeps short segments) whatever the corridor's heading.
  const d = [end[0] - access[0], end[1] - access[1]]
  const len = Math.hypot(d[0], d[1])
  const perp = [(-d[1] / len) * 0.0004, (d[0] / len) * 0.0004]
  const along = Array.from({ length: n }, (_, k): LatLng => [
    access[0] + (d[0] * (k + 1)) / n + (k % 2 && k < n - 1 ? perp[0] : 0),
    access[1] + (d[1] * (k + 1)) / n + (k % 2 && k < n - 1 ? perp[1] : 0),
  ])
  const pts = [start, access, ...along]
  const seg = (a: number, b: number) => { let d = 0; for (let i = a; i < b; i++) d += haversineM(pts[i], pts[i + 1]); return d }
  const total = seg(0, pts.length - 1)
  const steps: [string, string, number, number][] = [['Neptune Street', '', 0, 1], [PRIMARY[id], '', 1, pts.length - 1]]
  return {
    code: 'Ok',
    routes: [{ distance: total, duration: total / 10, geometry: { type: 'LineString', coordinates: pts.map(ll) },
      legs: [{ steps: steps.map(([name, ref, a, b]) => ({ name, ref, distance: seg(a, b), maneuver: { type: 'turn' }, geometry: { type: 'LineString', coordinates: pts.slice(a, b + 1).map(ll) } })) }] }],
    waypoints: [
      { location: ll(start), distance: haversineM(CAMPUS, start), name: '' },
      { location: ll(pts[pts.length - 1]), distance: haversineM(c.end, pts[pts.length - 1]), name: PRIMARY[id] },
    ],
  }
}

export type Fixture = { results: ReturnType<typeof gen.analyse>[]; geo: { text: string; sha256: string } }
export function makeFixture(bodies: Record<string, unknown> = {}): Fixture {
  const results = CORRIDORS.map((c) => gen.analyse(c, bodies[c.id] ?? osrmBodyFor(c.id), gen.bearingsFor(c)))
  const geo = gen.serializeDiagnosticGeoJSON(results, { runId: RUN_ID, generatedAt: '2026-12-01T00:00:00.000Z', osrmDataVersion: null, versions: { ...VERSIONS } })
  return { results, geo }
}
export const FIXTURE = makeFixture()
export const RESULTS = FIXTURE.results
export const GEO = FIXTURE.geo
export const GEO_PATH = approve.diagnosticGeoJsonPath(RUN_ID)

export function makeEvidence(): SharedEvidence {
  return {
    approvalSchemaVersion: 'as-1', evidenceId: 'alangilan-campus-exit-20261201', evidenceType: 'on-site-inspection',
    subject: 'Campus exit via Neptune Street', segmentsInspected: ['Neptune Street'], inspectedOn: '2026-12-01', inspectedBy: 'Campus DRRMO staff (role)',
    publicAccess: { status: 'public-with-conditions', conditions: 'Gate open 05:00–22:00', finding: 'Open to the public through the side gate.' },
    usability: { status: 'usable', finding: 'Paved and lit.' },
    evidenceRefs: ['https://example.org/biyahe/campus-exit-2026-12-01', PHOTOS],
    appliesToRoutes: CORRIDORS.map((c) => c.id), limitations: 'One weekday morning.',
  }
}

export function makeRecord(id: string, ev = makeEvidence(), fx: Fixture = FIXTURE): ApprovalRecord {
  const r = fx.results.find((x) => x.id === id)!
  const c = CORRIDORS.find((x) => x.id === id)!
  const snapped = r.snappedEnd as LatLng
  const base = { reviewer: 'Project team (role)', reviewedOn: '2026-12-02', runId: RUN_ID, routeGeometrySha256: r.routeGeometrySha256 as string }
  const resolutions = r.warnings.map((w) => {
    if (w.code === 'campus-exit-unverified') {
      return { ...base, warningCode: w.code, outcome: 'accepted-limitation', resolution: 'Accepted under the documented gate hours.', evidenceType: 'on-site-inspection',
        evidenceRef: approve.EVIDENCE_PATH, sharedEvidenceId: ev.evidenceId, conditionsAcknowledged: evidenceConditions(ev) }
    }
    if (w.code === 'endpoint-snap' || w.code === 'endpoint-zone-not-reached') {
      return { ...base, warningCode: w.code, outcome: 'accepted-limitation', resolution: 'Snapped point serves the intended exit.', evidenceType: 'map-review', evidenceRef: NOTES,
        endpointRelationship: { requestedEndpoint: c.end, acceptedEndpoint: snapped, separationM: haversineM(c.end, snapped), intendedDestination: 'Intended stop', relationship: 'Nearest carriageway point.' } }
    }
    return { ...base, warningCode: w.code, outcome: 'accepted-limitation', resolution: 'Visually acceptable.', evidenceType: 'map-review', evidenceRef: 'https://example.org/biyahe/review' }
  })
  return {
    ...VERSIONS, campus: 'alangilan', routeId: id, runId: RUN_ID, geojsonSha256: fx.geo.sha256, routeGeometrySha256: r.routeGeometrySha256 as string,
    pathEnds: c.pathEnds, reviewedBy: 'Project team (role)', reviewedOn: '2026-12-02', warnings: structuredClone(r.warnings), resolutions, history: [],
  }
}
