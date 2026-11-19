// Prototype preview activation and precedence (src/lib/previewGeometry.ts). Synthetic and in-memory; the real
// preview data is only read, never changed.
import { describe, expect, it } from 'vitest'
import { ALANGILAN_HAND_DRAWN_CORRIDORS } from '../campuses/alangilan'
import alangilanSource from '../campuses/alangilan.ts?raw'
import { ALANGILAN_PREVIEW_ROADS } from '../campuses/alangilan.preview.roads'
import type { Corridor, LatLng } from '../types'
import {
  activatePreviewGeometry, CAMPUS_EXIT_NOTE, isPreviewMode, PREVIEW_MODES, PREVIEW_NOTICE, previewRouteNotes,
  selectCorridorGeometry, type PreviewRoadSet,
} from './previewGeometry'
import { approvalRecordPath, evidenceRecordPath, REVIEWED_ROADS_FORMAT, type ReviewedRoadSet } from './reviewedGeometry'
import { routeGeometryHash } from './routeHash.js'
import { VERSIONS } from './routeVersions'

const ANCHOR: LatLng = [13.7842, 121.0744]
const CTX = { campusId: 'alangilan', anchor: ANCHOR }
const hand = (): Corridor[] => structuredClone(ALANGILAN_HAND_DRAWN_CORRIDORS)
const preview = (): PreviewRoadSet => structuredClone(ALANGILAN_PREVIEW_ROADS)

// A synthetic, internally valid formal set (different paths from the preview, so the source is visible).
function formalSet(): ReviewedRoadSet {
  const r5 = (v: number) => Number(v.toFixed(5))
  return {
    format: REVIEWED_ROADS_FORMAT, campus: 'alangilan', campusAnchor: [...ANCHOR] as LatLng, versions: { ...VERSIONS },
    runId: 'R-1', geojsonSha256: 'e'.repeat(64),
    evidence: { path: evidenceRecordPath('alangilan'), recordSha256: 'f'.repeat(64), commitSha: 'c'.repeat(40) },
    routes: ALANGILAN_HAND_DRAWN_CORRIDORS.map((c, i) => {
      const path: LatLng[] = [ANCHOR, [r5(13.79 + i / 1000), r5(121.06 + i / 1000)]]
      return { routeId: c.id, path, routeGeometrySha256: routeGeometryHash(path, ANCHOR), pathEnds: c.id === 'lipa' || c.id === 'tanauan' ? 'partial' : null,
        approval: { path: approvalRecordPath('alangilan', c.id), recordSha256: 'a'.repeat(64), commitSha: 'c'.repeat(40) } }
    }),
  }
}

function expectFallback(p: unknown, message: RegExp) {
  const hd = hand()
  const res = activatePreviewGeometry(hd, p as PreviewRoadSet, CTX)
  expect(res.active).toBe(false)
  expect(res.corridors).toBe(hd)
  expect(res.problems.join('\n')).toMatch(message)
}

describe('preview activation: all five or none', () => {
  it('the real preview activates all five road paths; only the paths change', () => {
    const hd = hand()
    const res = activatePreviewGeometry(hd, preview(), CTX)
    expect(res).toMatchObject({ active: true, problems: [] })
    res.corridors.forEach((c, i) => {
      const { path, ...rest } = c
      const { path: _p, ...orig } = ALANGILAN_HAND_DRAWN_CORRIDORS[i]
      expect(rest).toEqual(orig)                                        // labels, via, travel times, counts unchanged
      expect(path).toEqual(ALANGILAN_PREVIEW_ROADS.routes[i].path)
      expect(path.length).toBeGreaterThan(ALANGILAN_HAND_DRAWN_CORRIDORS[i].path.length)
    })
    expect(hd).toEqual(ALANGILAN_HAND_DRAWN_CORRIDORS)
  })

  it('null leaves the hand-drawn corridors', () => {
    const hd = hand()
    expect(activatePreviewGeometry(hd, null, CTX)).toEqual({ corridors: hd, active: false, problems: [] })
  })

  it.each([
    ['a missing route', (p: PreviewRoadSet) => { p.routes = p.routes.slice(0, 4) }, /route tanauan is missing/],
    ['a duplicate route', (p: PreviewRoadSet) => { p.routes[4] = structuredClone(p.routes[0]) }, /duplicate route lipa/],
    ['an unknown route', (p: PreviewRoadSet) => { p.routes[2].routeId = 'pablo-borbon' }, /unknown route "pablo-borbon"/],
    ['an invalid coordinate', (p: PreviewRoadSet) => { p.routes[1].path[3] = [Number.NaN, 121.06] }, /batangas: invalid path/],
    ['swapped coordinates', (p: PreviewRoadSet) => { p.routes[1].path[3] = [121.06, 13.79] }, /batangas: invalid path/],
    ['a geometry hash mismatch', (p: PreviewRoadSet) => { p.routes[3].routeGeometrySha256 = '0'.repeat(64) }, /sanjose: routeGeometrySha256 does not match the path/],
    ['an edited path', (p: PreviewRoadSet) => { p.routes[3].path[5] = [Number((p.routes[3].path[5][0] + 0.00001).toFixed(5)), p.routes[3].path[5][1]] }, /sanjose: routeGeometrySha256 does not match/],
    ['a path not starting at the campus', (p: PreviewRoadSet) => { p.routes[0].path = p.routes[0].path.slice(1) }, /lipa: invalid path/],
    ['a different status', (p: PreviewRoadSet) => { (p as Record<string, unknown>).status = 'approved' }, /status must be unverified-prototype-preview/],
    ['incompatible versions', (p: PreviewRoadSet) => { p.versions = { ...p.versions, geometryProcessingVersion: 'gp-2' } }, /incompatible versions: geometryProcessingVersion/],
    ['a different campus anchor', (p: PreviewRoadSet) => { p.campusAnchor = [13.78419, 121.07428] }, /campusAnchor must equal/],
    ['an unknown field', (p: PreviewRoadSet) => { (p.routes[0] as Record<string, unknown>).approved = true }, /routes\[0\]: unknown field approved/],
    ['malformed routes', (p: PreviewRoadSet) => { (p as Record<string, unknown>).routes = 'five' }, /routes must be an array/],
  ])('rejects %s and keeps every hand-drawn path', (_l, mutate, message) => {
    const p = preview()
    mutate(p)
    expectFallback(p, message)
  })

  it('a validation error while reading the data falls back instead of crashing', () => {
    const p = preview()
    Object.defineProperty(p, 'routes', { get() { throw new Error('boom') }, enumerable: true })
    expectFallback(p, /validation error: boom/)
  })
})

describe('precedence', () => {
  const select = (formal: ReviewedRoadSet | null, previewEnabled: boolean, p: PreviewRoadSet | null = preview()) =>
    selectCorridorGeometry({ handDrawn: hand(), formal, preview: p, previewEnabled, ctx: CTX })

  it('1. valid formal reviewed geometry wins over the preview', () => {
    const r = select(formalSet(), true)
    expect(r.source).toBe('reviewed')
    expect(r.corridors[0].path).toEqual(formalSet().routes[0].path)
    expect(r.preview).toBeNull()
  })

  it('2. no formal geometry and preview enabled: the preview is used', () => {
    const r = select(null, true)
    expect(r.source).toBe('preview')
    expect(r.corridors.map((c) => c.path)).toEqual(ALANGILAN_PREVIEW_ROADS.routes.map((x) => x.path))
    expect(r.previewRoutes).toEqual(ALANGILAN_PREVIEW_ROADS.routes)
  })

  it('3. no formal geometry and preview disabled (ordinary production): hand-drawn', () => {
    const r = select(null, false)
    expect(r.source).toBe('hand-drawn')
    expect(r.corridors).toEqual(ALANGILAN_HAND_DRAWN_CORRIDORS)
    expect(r.preview).toBeNull()
  })

  it('4. INVALID formal geometry keeps the hand-drawn fallback even with the preview enabled', () => {
    const bad = formalSet()
    bad.routes = bad.routes.slice(0, 4)
    const r = select(bad, true)
    expect(r.source).toBe('hand-drawn')
    expect(r.corridors).toEqual(ALANGILAN_HAND_DRAWN_CORRIDORS)
    expect(r.formal.active).toBe(false)
    expect(r.formal.problems.join('\n')).toMatch(/route tanauan is missing/)
    expect(r.preview).toBeNull()
  })

  it('an invalid preview falls back to hand-drawn', () => {
    const p = preview()
    p.routes.pop()
    const r = select(null, true, p)
    expect(r.source).toBe('hand-drawn')
    expect(r.corridors).toEqual(ALANGILAN_HAND_DRAWN_CORRIDORS)
    expect(r.preview?.active).toBe(false)
    expect(r.previewRoutes).toBeNull()
  })
})

describe('preview mode', () => {
  it('is on in the dev server and an explicit route-preview build only', () => {
    expect(PREVIEW_MODES).toEqual(['development', 'route-preview'])
    expect(isPreviewMode('development')).toBe(true)
    expect(isPreviewMode('route-preview')).toBe(true)
    expect(isPreviewMode('production')).toBe(false)
    expect(isPreviewMode('test')).toBe(false)
    expect(isPreviewMode(undefined)).toBe(false)
  })

  it('alangilan.ts shows the road-following routes to users in every build', () => {
    expect(alangilanSource).toContain('export const PREVIEW_ON = true')
    expect(alangilanSource).toContain('preview: PREVIEW_ON ? ALANGILAN_TRIP_ROADS : null')
  })
})

describe('on-map wording', () => {
  const route = (id: string) => ALANGILAN_PREVIEW_ROADS.routes.find((r) => r.routeId === id)!
  it('the persistent notice has the required text', () => {
    expect(PREVIEW_NOTICE).toBe('These routes follow roads in OpenStreetMap and have not been checked on site or formally approved. Use them as a guide to which roads your trip uses, not as turn-by-turn navigation or confirmation of public access.')
  })

  it('route-specific limitations', () => {
    expect(previewRouteNotes(route('lipa'), 'Lipa City')).toEqual(['Partial route, not a complete trip to Lipa City.', CAMPUS_EXIT_NOTE])
    expect(previewRouteNotes(route('tanauan'), 'Tanauan / Sto. Tomas')[0]).toBe('Partial route, not a complete trip to Tanauan / Sto. Tomas.')
    expect(previewRouteNotes(route('bauan'), 'Bauan')[0]).toMatch(/430\.1 m destination overshoot/)
    const sj = previewRouteNotes(route('sanjose'), 'San Jose / Ibaan').join(' ')
    expect(sj).toMatch(/ends on the STAR mainline, 202\.5 m from the configured destination/)
    expect(sj).toMatch(/not an approved vehicle stopping or alighting point/)
    expect(sj).toMatch(/no pedestrian connection to the destination has been verified/)
    expect(previewRouteNotes(route('batangas'), 'Batangas City proper')).toEqual([CAMPUS_EXIT_NOTE])
    for (const r of ALANGILAN_PREVIEW_ROADS.routes) expect(previewRouteNotes(r, 'x')).toContain(CAMPUS_EXIT_NOTE)
  })

  it('never claims approval, verification, navigation or walking directions', () => {
    const all = [PREVIEW_NOTICE, ...ALANGILAN_PREVIEW_ROADS.routes.flatMap((r) => previewRouteNotes(r, 'x'))].join(' ')
    expect(all).not.toMatch(/\bis approved\b|\bverified route\b|turn left|turn right|walk (north|south|east|west)/i)
  })
})
