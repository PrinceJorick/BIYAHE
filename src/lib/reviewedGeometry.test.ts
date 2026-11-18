// Fail-closed activation of reviewed road geometry (src/lib/reviewedGeometry.ts). All road data here is
// synthetic and in memory; no approval records or real road geometry are created.
import { describe, expect, it } from 'vitest'
import * as approve from '../../scripts/approve-routes.mjs'
import { alangilan, ALANGILAN_HAND_DRAWN_CORRIDORS, alangilanRoadActivation } from '../campuses/alangilan'
import { alangilanRoads } from '../campuses/alangilan.roads'
import type { Corridor, LatLng } from '../types'
import {
  activateReviewedGeometry, approvalRecordPath, evidenceRecordPath, REVIEWED_ROADS_FORMAT, validateReviewedRoadSet, type ReviewedRoadSet,
} from './reviewedGeometry'
import { CAMPUS, CORRIDORS } from './routeChecks'
import { routeGeometryHash } from './routeHash.js'
import { VERSIONS } from './routeVersions'

const ANCHOR: LatLng = [13.7842, 121.0744]
const CTX = { campusId: 'alangilan', anchor: ANCHOR }
const IDS = ['lipa', 'batangas', 'bauan', 'sanjose', 'tanauan']

// The five hand-drawn corridors exactly as committed before Step 5 (HEAD c97fe72). The fallback must
// return precisely this data.
const ORIGINAL: Corridor[] = [
  { id: 'lipa', name: 'Lipa City', via: 'JP Laurel Hwy', usualMin: 50, commuters: 140,
    path: [ANCHOR, [13.7875, 121.0705], [13.7935, 121.0655], [13.8, 121.064], [13.81, 121.07]] },
  { id: 'batangas', name: 'Batangas City proper', via: 'P. Burgos', usualMin: 20, commuters: 210,
    path: [ANCHOR, [13.778, 121.069], [13.77, 121.064], [13.7575, 121.058]] },
  { id: 'bauan', name: 'Bauan / San Pascual', via: 'Diversion Rd', usualMin: 35, commuters: 60,
    path: [ANCHOR, [13.783, 121.062], [13.786, 121.045], [13.79, 121.02]] },
  { id: 'sanjose', name: 'San Jose / Ibaan', via: 'Batangas–Lipa Rd', usualMin: 30, commuters: 85,
    path: [ANCHOR, [13.792, 121.085], [13.805, 121.1], [13.82, 121.115]] },
  { id: 'tanauan', name: 'Tanauan / Sto. Tomas', via: 'STAR Tollway', usualMin: 65, commuters: 45,
    path: [ANCHOR, [13.795, 121.078], [13.82, 121.085], [13.85, 121.095]] },
]

const r5 = (v: number) => Number(v.toFixed(5))
const roadPathFor = (i: number): LatLng[] => [ANCHOR, [r5(13.7851 + i * 0.0011), r5(121.0702 - i * 0.0007)], [r5(13.7903 + i * 0.0013), r5(121.0611 + i * 0.0009)], [r5(13.8004 + i * 0.0017), r5(121.0523 + i * 0.0021)]]

// A synthetic, internally consistent five-route set.
function validSet(): ReviewedRoadSet {
  return {
    format: REVIEWED_ROADS_FORMAT, campus: 'alangilan', campusAnchor: [...ANCHOR], versions: { ...VERSIONS },
    runId: '20261201T000000Z-fixt01', geojsonSha256: 'e'.repeat(64),
    evidence: { path: evidenceRecordPath('alangilan'), recordSha256: 'f'.repeat(64), commitSha: 'c'.repeat(40) },
    routes: IDS.map((id, i) => {
      const path = roadPathFor(i)
      return {
        routeId: id, path, routeGeometrySha256: routeGeometryHash(path, ANCHOR), pathEnds: id === 'lipa' || id === 'tanauan' ? 'partial' : null,
        approval: { path: approvalRecordPath('alangilan', id), recordSha256: String(i).repeat(64), commitSha: 'c'.repeat(40) },
      }
    }),
  }
}
const handDrawn = () => structuredClone(ORIGINAL)
const activate = (roads: unknown, hd = handDrawn()) => ({ hd, res: activateReviewedGeometry(hd, roads as ReviewedRoadSet, CTX) })

// Asserts the fallback: the identical array and objects, unchanged, and not active.
function expectFallback(roads: unknown, message?: RegExp) {
  const { hd, res } = activate(roads)
  expect(res.active).toBe(false)
  expect(res.corridors).toBe(hd)
  res.corridors.forEach((c, i) => expect(c).toBe(hd[i]))
  expect(res.corridors).toEqual(ORIGINAL)
  if (message) expect(res.problems.join('\n')).toMatch(message)
  return res
}

describe('the application today', () => {
  it('the roads file is null', () => {
    expect(alangilanRoads).toBeNull()
  })

  it('all five Alangilan corridors use their original hand-drawn paths, unchanged', () => {
    expect(alangilanRoadActivation).toEqual({ corridors: ALANGILAN_HAND_DRAWN_CORRIDORS, active: false, problems: [] })
    expect(alangilan.corridors).toBe(ALANGILAN_HAND_DRAWN_CORRIDORS)
    expect(alangilan.corridors).toEqual(ORIGINAL)
  })

  it('the campus anchor is the same point the route tools hash against', () => {
    expect(alangilan.location).toEqual(CAMPUS)
    expect(ANCHOR).toEqual(alangilan.location)
    expect(alangilan.corridors.map((c) => c.id)).toEqual(CORRIDORS.map((c) => c.id))
  })

  it('approval file paths match the approval validator', () => {
    for (const id of IDS) expect(approvalRecordPath('alangilan', id)).toBe(approve.recordPath(id))
    expect(evidenceRecordPath('alangilan')).toBe(approve.EVIDENCE_PATH)
  })

  it('pins the roads file format identifier', () => {
    expect(REVIEWED_ROADS_FORMAT).toBe('biyahe-reviewed-roads-1')
  })
})

describe('fallback (fail closed)', () => {
  it('null and undefined road data return the hand-drawn corridors as the same objects', () => {
    expect(expectFallback(null).problems).toEqual([])
    expect(expectFallback(undefined).problems).toEqual([])
  })

  it.each([
    ['an empty object', {}, /format must be/],
    ['an array', [], /not an object/],
    ['a string', 'roads', /not an object/],
    ['an empty route list', { ...validSet(), routes: [] }, /exactly 5 entries \(found 0\)/],
  ])('%s falls back', (_l, roads, message) => { expectFallback(roads, message) })

  it('four approved routes and one missing route never activate', () => {
    const s = validSet()
    s.routes = s.routes.filter((r) => r.routeId !== 'sanjose')
    const res = expectFallback(s, /route sanjose is missing/)
    expect(res.problems.join('\n')).toMatch(/exactly 5 entries \(found 4\)/)
  })

  it('a single route never activates', () => {
    const s = validSet()
    s.routes = [s.routes[0]]
    expectFallback(s, /exactly 5 entries \(found 1\)/)
  })

  it('duplicate route IDs are rejected (also when the count is five)', () => {
    const s = validSet()
    s.routes[4] = { ...s.routes[0] }
    const res = expectFallback(s, /duplicate route lipa/)
    expect(res.problems.join('\n')).toMatch(/route tanauan is missing/)
    const six = validSet()
    six.routes.push({ ...six.routes[1] })
    expectFallback(six, /duplicate route batangas/)
  })

  it('an unknown route ID is rejected', () => {
    const s = validSet()
    s.routes[2] = { ...s.routes[2], routeId: 'pablo-borbon' }
    expectFallback(s, /unknown route "pablo-borbon"/)
  })

  it.each([
    ['NaN', [Number.NaN, 121.06]],
    ['Infinity', [13.79, Number.POSITIVE_INFINITY]],
    ['latitude out of range', [91, 121.06]],
    ['longitude out of range', [13.79, 181]],
    ['not rounded to 5 decimals', [13.790001, 121.06]],
    ['a string coordinate', ['13.79', 121.06]],
    ['a three-element point', [13.79, 121.06, 0]],
  ])('invalid coordinates are rejected: %s', (_l, point) => {
    const s = validSet()
    const path = [...s.routes[1].path] as unknown[]
    path[2] = point
    s.routes[1] = { ...s.routes[1], path: path as LatLng[] }
    expectFallback(s, /batangas: invalid path/)
  })

  it('a path that does not start at the campus anchor, or repeats it, is rejected', () => {
    const s = validSet()
    s.routes[0] = { ...s.routes[0], path: s.routes[0].path.slice(1) }
    expectFallback(s, /lipa: invalid path: The application path must start at the campus point/)
    const t = validSet()
    t.routes[0] = { ...t.routes[0], path: [...t.routes[0].path, ANCHOR] }
    expectFallback(t, /lipa: invalid path: Duplicate campus anchor/)
  })

  it('a path with only the campus point is rejected', () => {
    const s = validSet()
    s.routes[3] = { ...s.routes[3], path: [ANCHOR] }
    expectFallback(s, /sanjose: invalid path/)
  })

  it('an incorrect geometry hash is rejected', () => {
    const s = validSet()
    s.routes[3] = { ...s.routes[3], routeGeometrySha256: routeGeometryHash(roadPathFor(0), ANCHOR) }
    expectFallback(s, /sanjose: routeGeometrySha256 does not match the path/)
  })

  it('a path edited after hashing is rejected', () => {
    const s = validSet()
    s.routes[2].path[1] = [r5(s.routes[2].path[1][0] + 0.00001), s.routes[2].path[1][1]]
    expectFallback(s, /bauan: routeGeometrySha256 does not match the path/)
  })

  it.each([
    ['routing policy', { routingPolicyVersion: 'rp-0' }, /incompatible versions: routingPolicyVersion/],
    ['geometry processing', { geometryProcessingVersion: 'gp-2' }, /incompatible versions: geometryProcessingVersion/],
    ['warning schema', { warningSchemaVersion: 'ws-0' }, /incompatible versions: warningSchemaVersion/],
    ['approval schema', { approvalSchemaVersion: 'as-0' }, /incompatible versions: approvalSchemaVersion/],
    ['an unknown version key', { extraVersion: 'x' }, /versions: unknown field extraVersion/],
  ])('incompatible versions are rejected: %s', (_l, change, message) => {
    expectFallback({ ...validSet(), versions: { ...VERSIONS, ...change } }, message)
  })

  it('missing versions are rejected', () => {
    const { generatorVersion: _g, ...rest } = VERSIONS
    expectFallback({ ...validSet(), versions: rest }, /versions: generatorVersion is missing/)
    expectFallback({ ...validSet(), versions: undefined }, /versions are missing/)
  })

  it.each([
    ['a missing approval reference', (s: ReviewedRoadSet) => { delete (s.routes[0] as Partial<ReviewedRoadSet['routes'][0]>).approval }, /lipa approval: approval reference is missing/],
    ['a wrong record path', (s: ReviewedRoadSet) => { s.routes[0].approval.path = approve.recordPath('batangas') }, /lipa approval: path must be docs\/routes\/approvals\/alangilan\/lipa.json/],
    ['a malformed record hash', (s: ReviewedRoadSet) => { s.routes[0].approval.recordSha256 = 'abc' }, /lipa approval: recordSha256 must be a SHA-256 hex digest/],
    ['an abbreviated commit SHA', (s: ReviewedRoadSet) => { s.routes[0].approval.commitSha = 'c97fe72' }, /lipa approval: commitSha must be a full 40-character commit SHA/],
    ['a bare approved flag instead of metadata', (s: ReviewedRoadSet) => { (s.routes[0] as Record<string, unknown>).approval = { approved: true } }, /lipa approval: unknown field approved/],
    ['an extra approved flag on a route', (s: ReviewedRoadSet) => { (s.routes[0] as Record<string, unknown>).approved = true }, /routes\[0\]: unknown field approved/],
    ['a wrong evidence path', (s: ReviewedRoadSet) => { s.evidence.path = 'docs/routes/approvals/evidence/other.json' }, /evidence: path must be/],
    ['a malformed evidence commit', (s: ReviewedRoadSet) => { s.evidence.commitSha = 'z'.repeat(40) }, /evidence: commitSha must be/],
    ['a missing run ID', (s: ReviewedRoadSet) => { s.runId = '' }, /runId is missing or malformed/],
    ['a malformed GeoJSON hash', (s: ReviewedRoadSet) => { s.geojsonSha256 = 'E'.repeat(64) }, /geojsonSha256 must be a SHA-256 hex digest/],
    ['an invalid pathEnds', (s: ReviewedRoadSet) => { (s.routes[1] as Record<string, unknown>).pathEnds = 'full' }, /batangas: pathEnds must be/],
    ['another campus', (s: ReviewedRoadSet) => { s.campus = 'malvar' }, /campus must be alangilan/],
    ['a different campus anchor', (s: ReviewedRoadSet) => { s.campusAnchor = [13.78419, 121.07428] }, /campusAnchor must equal the campus location exactly/],
    ['a different format', (s: ReviewedRoadSet) => { (s as Record<string, unknown>).format = 'biyahe-reviewed-roads-0' }, /format must be biyahe-reviewed-roads-1/],
    ['an unknown top-level field', (s: ReviewedRoadSet) => { (s as Record<string, unknown>).approved = true }, /unknown field approved/],
  ])('invalid approval metadata is rejected: %s', (_l, mutate, message) => {
    const s = validSet()
    mutate(s)
    expectFallback(s, message)
  })

  it('one failed route prevents activation of the entire set', () => {
    const s = validSet()
    s.routes[4] = { ...s.routes[4], routeGeometrySha256: '0'.repeat(64) }
    const res = expectFallback(s)
    expect(res.problems).toEqual(['tanauan: routeGeometrySha256 does not match the path'])
  })

  it('a validation error (thrown while reading the data) falls back instead of crashing', () => {
    const s = validSet()
    Object.defineProperty(s, 'routes', { get() { throw new Error('boom') }, enumerable: true })
    expectFallback(s, /validation error: boom/)
  })

  it('hand-drawn corridors with duplicate IDs are never replaced', () => {
    const hd = handDrawn()
    hd[4] = { ...hd[4], id: 'lipa' }
    const res = activateReviewedGeometry(hd, validSet(), CTX)
    expect(res.active).toBe(false)
    expect(res.corridors).toBe(hd)
  })

  it('validateReviewedRoadSet reports nothing for a consistent set', () => {
    expect(validateReviewedRoadSet(validSet(), { ...CTX, routeIds: IDS })).toEqual([])
  })
})

describe('activation (all five together)', () => {
  it('five valid synthetic routes activate together; only the paths change', () => {
    const roads = validSet()
    const { hd, res } = activate(roads)
    expect(res).toMatchObject({ active: true, problems: [] })
    expect(res.corridors).not.toBe(hd)
    expect(res.corridors.map((c) => c.id)).toEqual(IDS)
    res.corridors.forEach((c, i) => {
      const { path, ...rest } = c
      const { path: _orig, ...origRest } = ORIGINAL[i]
      expect(rest).toEqual(origRest)                       // name, via, usualMin, commuters unchanged
      expect(path).toEqual(roadPathFor(i))                  // the reviewed path
      expect(path[0]).toEqual(ANCHOR)                       // campus anchor first
      expect(path).not.toBe(roads.routes[i].path)           // copied, not shared with the data
    })
    expect(hd).toEqual(ORIGINAL)                            // the hand-drawn input is not mutated
  })

  it('route order in the data does not matter; corridor order is kept', () => {
    const roads = validSet()
    roads.routes.reverse()
    const { res } = activate(roads)
    expect(res.active).toBe(true)
    expect(res.corridors.map((c) => c.id)).toEqual(IDS)
    expect(res.corridors[0].path).toEqual(roadPathFor(0))
  })
})
