// Integration tests for the developer-only route generator (scripts/build-routes.mjs), imported directly.
// No network: OSRM responses are synthetic fixtures, and output promotion is replaced by a capturing stub,
// so no file is written.
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as gen from '../../scripts/build-routes.mjs'
import type { LatLng } from '../types'
import { haversineM } from './geo'
import {
  buildAppPath, CAMPUS, CORRIDORS, geojsonSha256, recordSha256, routeGeometryHash, serializeAppPath, validateWarning,
  validateWarningList,
} from './routeChecks'
import { VERSIONS, WARNING_SCHEMA_PARAMS } from './routeVersions'

const ll = (p: LatLng): [number, number] => [p[1], p[0]]
const corridor = (id: string) => CORRIDORS.find((c) => c.id === id)!

type StepSpec = [name: string, ref: string, fromIndex: number, toIndex: number]

// One synthetic OSRM route along `pts` ([lat, lng]).
function osrmRoute(pts: LatLng[], steps: StepSpec[]) {
  const seg = (a: number, b: number) => { let d = 0; for (let i = a; i < b; i++) d += haversineM(pts[i], pts[i + 1]); return d }
  const total = seg(0, pts.length - 1)
  return {
    distance: total, duration: total / 10,
    geometry: { type: 'LineString', coordinates: pts.map(ll) },
    legs: [{ steps: steps.map(([name, ref, a, b]) => ({
      name, ref, distance: seg(a, b), maneuver: { type: 'turn' },
      geometry: { type: 'LineString', coordinates: pts.slice(a, b + 1).map(ll) },
    })) }],
  }
}

// A synthetic OSRM /route response; `routes` defaults to the single route along `pts`.
function osrmBody(pts: LatLng[], steps: StepSpec[], endSnapM: number, routes = [osrmRoute(pts, steps)]) {
  return {
    code: 'Ok',
    routes,
    waypoints: [
      { location: ll(pts[0]), distance: haversineM(CAMPUS, pts[0]), name: '' },
      { location: ll(pts[pts.length - 1]), distance: endSnapM, name: steps[steps.length - 1][0] },
    ],
  }
}

const BATANGAS_PTS: LatLng[] = [[13.78419, 121.07428], [13.782, 121.07], [13.779, 121.069], [13.77, 121.064], [13.76, 121.0605], [13.75752, 121.0581]]
const batangasBody = () => osrmBody(BATANGAS_PTS, [['Neptune Street', '', 0, 1], ['National Highway 4', '4', 1, 4], ['P. Burgos Street', '437', 4, 5]], 11)
const SANJOSE_PTS: LatLng[] = [[13.78419, 121.07428], [13.782, 121.07], [13.79, 121.08], [13.805, 121.1], [13.8191, 121.11663]]
const sanjoseBody = () => osrmBody(SANJOSE_PTS, [['Neptune Street', '', 0, 1], ['Southern Tagalog Arterial Road', 'E2', 1, 4]], 203.3)

const META = { runId: '20261201T000000Z-test01', generatedAt: '2026-12-01T00:00:00.000Z', osrmDataVersion: null }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('importing the generator', () => {
  it('starts no run and makes no request', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    vi.resetModules()
    const fresh = await import('../../scripts/build-routes.mjs')
    expect(typeof fresh.analyse).toBe('function')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('structured warnings', () => {
  it('makeWarning builds exactly { code, text, value }', () => {
    expect(gen.makeWarning('endpoint-snap', 'endpoint snap 203 m', 203.3)).toEqual({ code: 'endpoint-snap', text: 'endpoint snap 203 m', value: 203.3 })
    expect(Object.keys(gen.makeWarning('endpoint-snap', 't', 1))).toEqual(['code', 'text', 'value'])
  })

  it('analyse emits schema-valid structured warnings (batangas fixture: campus exit only)', () => {
    const r = gen.analyse(corridor('batangas'), batangasBody(), null)
    expect(r.failures).toEqual([])
    expect(r.warnings).toEqual([{
      code: 'campus-exit-unverified',
      text: 'campus exit unresolved: 522 m via Neptune Street; public access and actual usability require on-site verification',
      value: { distanceM: 522.4, roads: ['Neptune Street'] },
    }])
    expect(validateWarningList(r.warnings)).toEqual([])
    expect(gen.statusOf(r)).toBe('NEEDS REVIEW')
  })

  it('analyse emits endpoint, zone, bearing and campus-exit warnings with typed values (sanjose fixture)', () => {
    const r = gen.analyse(corridor('sanjose'), sanjoseBody(), ';30,45')
    expect(r.warnings.map((w) => w.code)).toEqual(['endpoint-snap', 'endpoint-zone-not-reached', 'snap-bearing-applied', 'campus-exit-unverified'])
    expect(r.warnings.find((w) => w.code === 'endpoint-snap')!.value).toBe(203.3)
    expect(r.warnings.find((w) => w.code === 'endpoint-zone-not-reached')!.value).toBe(WARNING_SCHEMA_PARAMS.thresholds.endpointZoneM)
    expect(r.warnings.find((w) => w.code === 'snap-bearing-applied')!.value).toEqual({ bearingDeg: 30, rangeDeg: 45 })
    for (const w of r.warnings) expect(validateWarning(w)).toEqual([])
    // The human-readable flags are exactly the warning texts, in the same order.
    expect(r.needsReview).toEqual(r.warnings.map((w) => w.text))
  })

  it('uses only codes from the shared warning schema', () => {
    const r = gen.analyse(corridor('sanjose'), sanjoseBody(), ';30,45')
    for (const w of r.warnings) expect(WARNING_SCHEMA_PARAMS.codes).toContain(w.code)
  })

  it('selects the first route only', () => {
    const steps: StepSpec[] = [['Neptune Street', '', 0, 1], ['National Highway 4', '4', 1, 4], ['P. Burgos Street', '437', 4, 5]]
    const first = osrmRoute(BATANGAS_PTS, steps)
    const decoy = { ...first, distance: 99_999 }
    const r = gen.analyse(corridor('batangas'), osrmBody(BATANGAS_PTS, steps, 11, [first, decoy]), null)
    expect(r.osrmDistanceM).toBe(first.distance)
  })
})

describe('application-path geometry hash', () => {
  it('hashes the complete application path: campus anchor first, then the processed road path', () => {
    const r = gen.analyse(corridor('batangas'), batangasBody(), null)
    expect(r.appPath![0]).toEqual(CAMPUS)
    expect(r.appPath).toEqual(buildAppPath(CAMPUS, r.path!))
    expect(r.routeGeometrySha256).toBe(routeGeometryHash(r.appPath!, CAMPUS))
    expect(serializeAppPath(r.appPath!, CAMPUS).startsWith(`${VERSIONS.geometryProcessingVersion}|latlng|5|13.78420,121.07440;`)).toBe(true)
    expect(r.routeGeometrySha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('a different road geometry gives a different hash', () => {
    const a = gen.analyse(corridor('batangas'), batangasBody(), null)
    const moved = BATANGAS_PTS.map((p, i) => (i === 2 ? [13.7791, 121.069] as LatLng : p))
    const b = gen.analyse(corridor('batangas'), osrmBody(moved, [['Neptune Street', '', 0, 1], ['National Highway 4', '4', 1, 4], ['P. Burgos Street', '437', 4, 5]], 11), null)
    expect(b.routeGeometrySha256).not.toBe(a.routeGeometrySha256)
  })
})

describe('diagnostic outputs (promotion stubbed, nothing written)', () => {
  type Entry = { target: string; text: string; verify?: (text: string) => void }
  const run = (results: ReturnType<typeof gen.analyse>[]) => {
    const calls: Entry[][] = []
    const out = gen.writeOutputs(results, META, { promoteFn: (entries) => { for (const e of entries) e.verify?.(e.text); calls.push(entries) } })
    return { out, calls }
  }
  const results = () => [gen.analyse(corridor('batangas'), batangasBody(), null), gen.analyse(corridor('sanjose'), sanjoseBody(), ';30,45')]

  it('writes only the diagnostic report and GeoJSON while any route needs review', () => {
    const { out, calls } = run(results())
    expect(out.allCandidate).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0].map((e) => e.target)).toEqual([gen.DIAGNOSTIC_TARGET, out.geoTarget])
    expect(calls.flat().some((e) => e.target === gen.DATA_TARGET || e.target === gen.REPORT_TARGET)).toBe(false)
  })

  it('the GeoJSON hash covers the exact bytes that would be written, with no line-ending normalization', () => {
    const { out, calls } = run(results())
    const geo = calls[0].find((e) => e.target === out.geoTarget)!
    const bytes = new TextEncoder().encode(geo.text)
    expect(out.geojsonSha256).toBe(geojsonSha256(bytes))
    expect(geo.text.includes('\r')).toBe(false)
    expect(geojsonSha256(new TextEncoder().encode(geo.text.replace(/\n/g, '\r\n')))).not.toBe(out.geojsonSha256)
    // The staged-file check refuses text whose bytes differ from the recorded hash.
    expect(() => geo.verify!(geo.text.replace(/\n/g, '\r\n'))).toThrow(/do not match the recorded SHA-256/)
  })

  it('report and GeoJSON carry the same run ID, the five versions and the GeoJSON hash', () => {
    const { out, calls } = run(results())
    const report = calls[0].find((e) => e.target === gen.DIAGNOSTIC_TARGET)!.text
    const geo = JSON.parse(calls[0].find((e) => e.target === out.geoTarget)!.text)
    expect(geo.biyahe.runId).toBe(META.runId)
    expect(geo.biyahe.versions).toEqual(VERSIONS)
    expect(geo.biyahe.routingPolicy).toEqual(gen.routingPolicyParams())
    expect(report).toContain(`- Run ID: \`${META.runId}\``)
    expect(report).toContain(`- Diagnostic GeoJSON SHA-256 (exact file bytes, no normalization): \`${out.geojsonSha256}\``)
    for (const v of ['rp-1', 'gp-1', 'ws-1', 'as-1', VERSIONS.generatorVersion]) expect(report).toContain(`\`${v}\``)
    expect(out.meta.versions).toEqual(VERSIONS)
  })

  it('every route in the GeoJSON carries its structured warnings and application-path hash', () => {
    const rs = results()
    const { out, calls } = run(rs)
    const geo = JSON.parse(calls[0].find((e) => e.target === out.geoTarget)!.text)
    for (const r of rs) {
      const raw = geo.features.find((f: { properties: Record<string, unknown> }) => f.properties.kind === 'route-raw' && f.properties.corridorId === r.id)
      expect(raw.properties.warnings).toEqual(r.warnings)
      expect(raw.properties.routeGeometrySha256).toBe(r.routeGeometrySha256)
      expect(validateWarningList(raw.properties.warnings)).toEqual([])
    }
  })

  it('the report lists each warning with its code and the per-route geometry hash', () => {
    const rs = results()
    const { calls } = run(rs)
    const report = calls[0].find((e) => e.target === gen.DIAGNOSTIC_TARGET)!.text
    expect(report).toContain('- **sanjose** `endpoint-snap`: endpoint snap 203 m')
    for (const r of rs) expect(report).toContain(`\`${r.routeGeometrySha256}\``)
  })

  it('candidate data (all five CANDIDATE) records versions, the GeoJSON hash and per-route geometry hashes', () => {
    const base = gen.analyse(corridor('batangas'), batangasBody(), null)
    const five = CORRIDORS.map((c) => ({ ...base, id: c.id, warnings: [], flags: [], needsReview: [], failures: [] }))
    const { out, calls } = run(five)
    expect(out.allCandidate).toBe(true)
    expect(calls).toHaveLength(2)
    const data = calls[1].find((e) => e.target === gen.DATA_TARGET)!.text
    const report = calls[1].find((e) => e.target === gen.REPORT_TARGET)!.text
    expect(data).toContain(`versions: ${JSON.stringify(VERSIONS)}`)
    expect(data).toContain(`geojsonSha256: ${JSON.stringify(out.geojsonSha256)}`)
    expect(data).toContain(`routeGeometrySha256: ${JSON.stringify(base.routeGeometrySha256)}`)
    expect(data).toContain('approved: false')
    expect(report).toContain(recordSha256(data))
  })

  it('passes the wording guard (no positive claims) on every output', () => {
    const { calls } = run(results())
    for (const e of calls.flat()) expect(() => gen.assertNoPositiveClaims(e.target, e.text)).not.toThrow()
  })
})
