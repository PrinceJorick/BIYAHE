// The generated prototype preview (src/campuses/alangilan.preview.roads.ts) must be exactly what the generator
// produces from the committed diagnostic run: same five routes, same paths, same hashes, same provenance.
import { describe, expect, it } from 'vitest'
import * as gen from '../../scripts/build-preview-roads.mjs'
import { PREVIEW_STATUS, validatePreviewRoadSet } from '../lib/previewGeometry'
import { CORRIDORS, sha256Hex } from '../lib/routeChecks'
import { routeGeometryHash } from '../lib/routeHash.js'
import { VERSIONS } from '../lib/routeVersions'
import { alangilan, ALANGILAN_HAND_DRAWN_CORRIDORS } from './alangilan'
import { ALANGILAN_PREVIEW_ROADS } from './alangilan.preview.roads'
import { ALANGILAN_TRIP_ROADS } from './alangilan.trip.roads'
import { haversineM } from '../lib/geo.js'
import moduleSource from './alangilan.preview.roads.ts?raw'

const RUN = '20261117T124418Z-45d1ea'
const SHA = '70df8461a670d3113524b524fcde322c030cf542d22202177fc5d51c1f86156e'
const sources = import.meta.glob<string>('/docs/routes/diagnostics/alangilan-candidates.DIAGNOSTIC.20261117T124418Z-45d1ea.geojson', { query: '?raw', import: 'default', eager: true })
const diagnostic = Object.values(sources)[0]
const bytes = new TextEncoder().encode(diagnostic)
const IDS = ['lipa', 'batangas', 'bauan', 'sanjose', 'tanauan']

describe('diagnostic source', () => {
  it('is the committed run with the expected exact-bytes SHA-256', () => {
    expect(Object.keys(sources)).toHaveLength(1)
    expect(sha256Hex(bytes)).toBe(SHA)
    expect(gen.PREVIEW_SOURCE).toEqual({ runId: RUN, sha256: SHA })
    expect(gen.sourcePath(RUN)).toBe(Object.keys(sources)[0].slice(1))
  })

  it('the generator refuses other bytes', () => {
    const altered = bytes.slice()
    altered[altered.length - 2] ^= 1
    expect(() => gen.buildPreviewRoads(altered)).toThrow(/does not match the expected/)
  })
})

describe('generated preview module', () => {
  it('equals what the generator produces from the committed diagnostic (data and file text)', () => {
    const data = gen.buildPreviewRoads(bytes)
    expect(ALANGILAN_PREVIEW_ROADS).toEqual(data)
    expect(moduleSource.replace(/\r\n/g, '\n')).toBe(gen.renderPreviewModule(data))
  })

  it('records its provenance and status', () => {
    expect(ALANGILAN_PREVIEW_ROADS).toMatchObject({ status: PREVIEW_STATUS, campus: 'alangilan', runId: RUN, sourceGeojsonSha256: SHA, versions: VERSIONS })
    expect(PREVIEW_STATUS).toBe('unverified-prototype-preview')
    expect(ALANGILAN_PREVIEW_ROADS.campusAnchor).toEqual(alangilan.location)
  })

  it('contains exactly the five routes, in corridor order, each passing validation', () => {
    expect(ALANGILAN_PREVIEW_ROADS.routes.map((r) => r.routeId)).toEqual(IDS)
    expect(validatePreviewRoadSet(ALANGILAN_PREVIEW_ROADS, { campusId: 'alangilan', anchor: alangilan.location, routeIds: IDS })).toEqual([])
  })

  it('every geometry hash is the existing hash of its path; paths start at the campus anchor', () => {
    for (const r of ALANGILAN_PREVIEW_ROADS.routes) {
      expect(routeGeometryHash(r.path, alangilan.location)).toBe(r.routeGeometrySha256)
      expect(r.path[0]).toEqual(alangilan.location)
      for (const [lat, lng] of r.path) {
        expect(Number(lat.toFixed(5))).toBe(lat)
        expect(Number(lng.toFixed(5))).toBe(lng)
        expect(lat).toBeGreaterThan(13.7)
        expect(lat).toBeLessThan(13.9)                    // [lat, lng] order, not [lng, lat]
      }
    }
  })

  it('matches the geometry hashes of run 20261117T124418Z-45d1ea and the configured partial routes', () => {
    expect(Object.fromEntries(ALANGILAN_PREVIEW_ROADS.routes.map((r) => [r.routeId, r.routeGeometrySha256]))).toEqual({
      lipa: '36fb28d5f5fc2b6d64f63b523807eabcd4a3d1cd82e9c21d061051d7866a18ca',
      batangas: '0acebf039f49791150704294d99b79e64ab5bf43a30d3e86d25fc53581a7479c',
      bauan: 'a739cf3b7e0b6b8fdb1f37dd670fb39b4e96583a342c990ed9fd159f98f62207',
      sanjose: '8bd8d0fd894975962374b2ef2299c53cbf9670a5b2024de5e9ed98afe19815d6',
      tanauan: '58229959c457faf52902cf8a7f61a660a0e960a0f12d3522de7539430fb3202e',
    })
    for (const r of ALANGILAN_PREVIEW_ROADS.routes) expect(r.pathEnds).toBe(CORRIDORS.find((c) => c.id === r.routeId)!.pathEnds)
  })

  it('carries the documented limitations: Bauan overshoot, San Jose endpoint, campus exit everywhere', () => {
    const by = Object.fromEntries(ALANGILAN_PREVIEW_ROADS.routes.map((r) => [r.routeId, r]))
    expect(by.bauan.warnings).toContainEqual({ code: 'destination-overshoot', value: 430.1 })
    expect(by.sanjose).toMatchObject({ endpointSeparationM: 202.5, endRoad: 'Southern Tagalog Arterial Road' })
    expect(by.sanjose.warnings.map((w) => w.code)).toEqual(['endpoint-snap', 'endpoint-zone-not-reached', 'snap-bearing-applied', 'campus-exit-unverified'])
    for (const r of ALANGILAN_PREVIEW_ROADS.routes) expect(r.warnings.map((w) => w.code)).toContain('campus-exit-unverified')
  })

  it('holds only application data: no server URL, raw response, file path or diagnostic markers', () => {
    for (const banned of ['http', 'osrm', '"geometry"', '"coordinates"', 'DIAGNOSTIC', '.geojson', '"steps"', '"legs"', 'waypoints']) {
      expect(moduleSource.split('\n').filter((l) => !l.startsWith('//')).join('\n'), banned).not.toContain(banned)
    }
  })
})

describe('the app in this test build', () => {
  it('uses the full-trip road paths in every build, not this partial diagnostic preview', () => {
    expect(alangilan.corridors).not.toBe(ALANGILAN_HAND_DRAWN_CORRIDORS)
    expect(alangilan.corridors.map((c) => c.path)).toEqual(ALANGILAN_TRIP_ROADS.routes.map((r) => r.path))
    expect(alangilan.corridors.map((c) => c.path)).not.toEqual(ALANGILAN_PREVIEW_ROADS.routes.map((r) => r.path))
  })

  it('every full trip reaches its town: no route ends at the old hand-drawn corridor stub', () => {
    const lengthKm = (path: [number, number][]) => path.slice(1).reduce((m, p, i) => m + haversineM(path[i], p), 0) / 1000
    const km = Object.fromEntries(ALANGILAN_TRIP_ROADS.routes.map((r) => [r.routeId, lengthKm(r.path)]))
    expect(km.lipa).toBeGreaterThan(20)     // Lipa City Grand Terminal (was a 3.8 km stub)
    expect(km.tanauan).toBeGreaterThan(35)  // Tanauan City Hall via STAR Tollway (was 9.7 km, near San Jose)
    expect(km.sanjose).toBeGreaterThan(10)  // San Jose poblacion
    expect(km.bauan).toBeGreaterThan(9)     // Bauan Municipal Hall
    for (const r of ALANGILAN_TRIP_ROADS.routes) {
      expect(r.pathEnds).toBeNull()
      expect(r.endpointSeparationM).toBeLessThan(200)
    }
  })
})
