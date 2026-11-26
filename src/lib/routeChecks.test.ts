// Route checks used by the developer-only generator. These run before every generator run
// (npm run routes:alangilan), so no OSRM request is made unless they pass. No network here.
import { describe, expect, it } from 'vitest'
import { alangilan, ALANGILAN_HAND_DRAWN_CORRIDORS } from '../campuses/alangilan'
import type { LatLng } from '../types'
import { dedupeConsecutive, haversineM, osrmToLatLng, roundLatLng, simplify } from './geo'
import {
  classifyEvidenceRef, extractRunFromGeoJSON, parsePorcelainZ, parseStrictJson, processRoadPath,
} from './routeChecks'
import {
  buildAppPath, checkEvidenceRef, ENDPOINT_WARNING_CODES, evidenceConditions, geojsonSha256, NOT_VERIFIED_IN_COMMITTED_MODE, parsePorcelain,
  recordSha256, routeGeometryHash, serializeAppPath, sha256Hex, validateApprovalRecord, validateApprovalSet,
  validateCleanTracked, validateSharedEvidence, validateWarning, validateWarningList, WARNING_CODES, WARNING_RULES,
  type ApprovalRecord, type RouteWarning, type SharedEvidence,
} from './routeChecks'
import { APPROVAL_SCHEMA_PARAMS, VERSIONS, WARNING_SCHEMA_PARAMS } from './routeVersions'
import {
  CAMPUS, CAMPUS_ACCESS_ROADS, CORRIDORS,
  bearingDeg, buildBearingsParam, classifyOvershoot, classifySnappedEndLoop, computeZoneExcess, detectCampusExit,
  finalApproach, findPositiveClaims, isNearStraight, localFrame, matchPrimaryRoads, nearStraight, normalizeRoadName,
  pointBeforeEnd, validateApproach, type PrimaryRoad, type Step,
} from './routeChecks'

// A metre grid centred on a requested destination D (the San Jose endpoint), so cases read in metres.
const D: LatLng = [13.82, 121.115]
const frame = localFrame(D)
const at = (x: number, y: number): LatLng => frame.toLatLng([x, y])
const line = (...pts: [number, number][]) => pts.map(([x, y]) => at(x, y))

describe('normalizeRoadName', () => {
  it('treats hyphens and en/em dashes the same', () => {
    expect(normalizeRoadName('Batangas City–San Pascual–Bauan Bypass Road')).toBe(normalizeRoadName('Batangas City-San Pascual-Bauan Bypass Road'))
    expect(normalizeRoadName('Batangas — Balete Road')).toBe(normalizeRoadName('Batangas-Balete Road'))
  })

  it('normalises case and whitespace', () => {
    expect(normalizeRoadName('  national   HIGHWAY 4 ')).toBe('national highway 4')
  })

  it('does not match a different word', () => {
    expect(normalizeRoadName('Aquino Street')).not.toBe(normalizeRoadName('Aquino Avenue'))
  })

  it('maps null, undefined and empty to an empty string', () => {
    expect(normalizeRoadName(null)).toBe('')
    expect(normalizeRoadName(undefined)).toBe('')
    expect(normalizeRoadName('   ')).toBe('')
  })
})

describe('matchPrimaryRoads (name only, no double counting)', () => {
  const NH4: PrimaryRoad[] = [{ label: 'National Highway 4', name: 'National Highway 4' }]

  it('counts a step by its name', () => {
    expect(matchPrimaryRoads([{ name: 'National Highway 4', ref: '4', distanceM: 1000 }], NH4, 2000)).toEqual({
      matchedM: 1000, share: 0.5, perRoad: { 'National Highway 4': 1000 },
    })
  })

  it('never counts a ref alone', () => {
    const steps: Step[] = [
      { name: '', ref: '4', distanceM: 500 },
      { name: null, ref: '4', distanceM: 500 },
      { name: 'President Jose P. Laurel Highway', ref: '4', distanceM: 500 },
    ]
    expect(matchPrimaryRoads(steps, NH4, 1500).matchedM).toBe(0)
    const star: PrimaryRoad[] = [{ label: 'STAR', name: 'Southern Tagalog Arterial Road' }]
    expect(matchPrimaryRoads([{ name: '', ref: 'E2', distanceM: 900 }], star, 900).matchedM).toBe(0)
    // A group entry that names a ref is still compared against step names only.
    expect(matchPrimaryRoads([{ name: 'Some Road', ref: '4', distanceM: 900 }], [{ label: '4', name: '4' }], 900).matchedM).toBe(0)
  })

  it('matches across hyphen / en-dash spellings', () => {
    const bauan: PrimaryRoad[] = [{ label: 'Bypass', name: 'Batangas City–San Pascual–Bauan Bypass Road' }]
    expect(matchPrimaryRoads([{ name: 'Batangas City-San Pascual-Bauan Bypass Road', ref: '434-1', distanceM: 4690 }], bauan, 9718).matchedM).toBe(4690)
  })

  it('counts a step once even when it matches several or duplicate group entries', () => {
    const dupes: PrimaryRoad[] = [
      { label: 'A', name: 'Aquino Avenue' }, { label: 'A again', name: 'aquino  avenue' }, { label: 'A dash', name: 'Aquino Avenue' },
    ]
    const r = matchPrimaryRoads([{ name: 'Aquino Avenue', distanceM: 1833 }], dupes, 2000)
    expect(r.matchedM).toBe(1833)
    expect(r.perRoad).toEqual({ A: 1833 })
  })

  it('perRoad sums to matchedM, share never exceeds 1, zero-distance steps are harmless', () => {
    const roads: PrimaryRoad[] = [{ label: 'NH4', name: 'National Highway 4' }, { label: 'Burgos', name: 'P. Burgos Street' }]
    const steps: Step[] = [
      { name: 'National Highway 4', distanceM: 3138.2 }, { name: 'P. Burgos Street', distanceM: 522.8 },
      { name: 'P. Burgos Street', distanceM: 0 }, { name: 'Neptune Street', distanceM: 410 },
    ]
    const r = matchPrimaryRoads(steps, roads, 4474.7)
    expect(Object.values(r.perRoad).reduce((a, b) => a + b, 0)).toBeCloseTo(r.matchedM, 9)
    expect(r.matchedM).toBeCloseTo(3661, 6)
    expect(r.share).toBeLessThanOrEqual(1)
    expect(matchPrimaryRoads([{ name: 'National Highway 4', distanceM: 1200 }], roads, 1000).share).toBe(1)
  })
})

describe('computeZoneExcess (overshoot, 100 m endpoint zone)', () => {
  it('straight approach to D gives about zero excess', () => {
    const path = Array.from({ length: 41 }, (_, k) => at(0, -2000 + k * 50))
    const r = computeZoneExcess(path, D)
    expect(r.measurable).toBe(true)
    expect(r.excessM).toBeLessThan(0.5)
  })

  it('a route ending short of D clamps to zero, not negative', () => {
    const r = computeZoneExcess(line([0, -2000], [0, -40]), D)
    expect(r.remainingM).toBeCloseTo(60, 0)
    expect(r.directM).toBeCloseTo(100, 0)
    expect(r.excessM).toBe(0)
  })

  it('detects a segment crossing the zone when neither vertex is inside', () => {
    const r = computeZoneExcess(line([-500, 50], [500, 50], [0, 0]), D)
    expect(r.measurable).toBe(true)
    expect(r.entryIndex).toBe(0)
    const [ex, ey] = frame.toXY(r.entryPoint as LatLng)
    expect(ex).toBeCloseTo(-86.6, 1)
    expect(ey).toBeCloseTo(50, 1)
    expect(r.excessM).toBeCloseTo(989.1, 0)
    expect(classifyOvershoot(r.excessM)).toBe('review')
  })

  it('enters, travels away and returns: known extra distance', () => {
    const r = computeZoneExcess(line([0, -300], [0, -50], [400, -50], [0, -50], [0, 0]), D)
    expect(r.measurable).toBe(true)
    expect(r.remainingM).toBeCloseTo(900, 0)
    expect(r.excessM).toBeCloseTo(800, 0)
    expect(classifyOvershoot(r.excessM)).toBe('review')
  })

  it('never entering the zone is not measurable — never zero', () => {
    const r = computeZoneExcess(line([0, -2000], [0, -150]), D)
    expect(r.measurable).toBe(false)
    expect(r.excessM).toBeNull()
    expect(classifyOvershoot(r.excessM)).toBe('not-measurable')
    expect(classifyOvershoot(r.excessM)).not.toBe(classifyOvershoot(0))
  })

  it('a route starting inside the zone enters at index 0', () => {
    const r = computeZoneExcess(line([0, -50], [0, 0]), D)
    expect(r.entryIndex).toBe(0)
    expect(r.excessM).toBeCloseTo(0, 6)
  })

  it('respects the 100 m radius at the boundary (99.99 m enters, 100.01 m does not)', () => {
    expect(computeZoneExcess(line([-500, 99.99], [500, 99.99], [500, 2000]), D).measurable).toBe(true)
    expect(computeZoneExcess(line([-500, 100.01], [500, 100.01], [500, 2000]), D).measurable).toBe(false)
  })

  it('rejects paths with fewer than two points', () => {
    expect(() => computeZoneExcess([D], D)).toThrow(TypeError)
  })
})

describe('classifyOvershoot (strictly greater than)', () => {
  it.each([
    [0, 'none'], [299, 'none'], [300, 'none'], [300.001, 'review'],
    [999, 'review'], [1000, 'review'], [1000.001, 'fail'], [1001, 'fail'],
  ] as const)('%s m → %s', (m, expected) => {
    expect(classifyOvershoot(m)).toBe(expected)
  })

  it('null is not measurable; undefined, NaN and negatives throw', () => {
    expect(classifyOvershoot(null)).toBe('not-measurable')
    expect(() => classifyOvershoot(undefined as unknown as number)).toThrow(TypeError)
    expect(() => classifyOvershoot(NaN)).toThrow(TypeError)
    expect(() => classifyOvershoot(-1)).toThrow(TypeError)
  })
})

describe('auxiliary snapped-endpoint loop measure', () => {
  it('regression: requested zone never reached, but the route enters the snapped zone, leaves and returns', () => {
    const S = at(0, 180) // snapped destination 180 m from the requested destination D
    const path = line([0, 1500], [0, 200], [600, 200], [0, 200], [0, 180])
    const primary = computeZoneExcess(path, D)
    expect(primary.measurable).toBe(false)
    expect(classifyOvershoot(primary.excessM)).toBe('not-measurable')
    const aux = computeZoneExcess(path, S)
    expect(aux.measurable).toBe(true)
    // Entry at (0, 280): 80 + 600 + 600 + 20 = 1,300 remaining, 100 direct.
    expect(aux.excessM).toBeCloseTo(1200, 0)
    expect(classifySnappedEndLoop(aux.excessM)).toBe('review')
  })

  it('can only warn: never fail, however large', () => {
    expect(classifySnappedEndLoop(300)).toBe('none')
    expect(classifySnappedEndLoop(300.001)).toBe('review')
    expect(classifySnappedEndLoop(50_000)).toBe('review')
    expect(classifySnappedEndLoop(null)).toBe('not-measurable')
    expect(() => classifySnappedEndLoop(NaN)).toThrow(TypeError)
  })
})

describe('final approach direction', () => {
  it('northbound ≈ 0°, eastbound ≈ 90°', () => {
    expect(finalApproach(line([0, -1000], [0, 0])).bearingDeg).toBeCloseTo(0, 1)
    const east = finalApproach(line([-1000, 0], [0, 0]))
    expect(east.bearingDeg).toBeCloseTo(90, 1)
    expect(east.compass).toBe('E')
  })

  it('uses the final 150 m, interpolated along the route', () => {
    // East 1 km, then north 400 m: the last 150 m are northbound.
    const path = line([-1000, -400], [0, -400], [0, 0])
    const p = frame.toXY(pointBeforeEnd(path, 150))
    expect(p[0]).toBeCloseTo(0, 1)
    expect(p[1]).toBeCloseTo(-150, 1)
    expect(finalApproach(path).bearingDeg).toBeCloseTo(0, 1)
    expect(finalApproach(path).shortRoute).toBe(false)
  })

  it('flags routes shorter than 150 m and uses the whole route', () => {
    const r = finalApproach(line([0, -100], [0, 0]))
    expect(r.shortRoute).toBe(true)
    expect(r.measuredOverM).toBeCloseTo(100, 0)
  })

  it('bearingDeg returns values in [0, 360)', () => {
    expect(bearingDeg(at(0, 0), at(0, -100))).toBeCloseTo(180, 1)
    expect(bearingDeg(at(0, 0), at(-100, 0))).toBeCloseTo(270, 1)
  })
})

describe('near-straight warning (straight >= 500 m and ratio < 1.02)', () => {
  it.each([
    [500, 510, false], // ratio exactly 1.02
    [500, 509.99, true], // just below 1.02
    [499, 499, false], // below the 500 m minimum
    [500, 500, true],
    [600, 600, true],
    [1000, 1250, false], // candidate ratios are 1.25–2.16
  ] as const)('straight %s m, length %s m → %s', (straight, length, warn) => {
    expect(isNearStraight(straight, length)).toBe(warn)
  })

  it('flags a straight 600 m path and not a doglegged one', () => {
    expect(nearStraight(line([0, -600], [0, 0])).warn).toBe(true)
    expect(nearStraight(line([-600, -600], [0, -600], [0, 0])).warn).toBe(false)
  })
})

describe('buildBearingsParam (one entry per coordinate)', () => {
  const end = (n: number, bearingDeg = 30, rangeDeg = 45) => [{ index: n - 1, bearingDeg, rangeDeg }]

  it('constrains only the destination', () => {
    expect(buildBearingsParam(2, end(2))).toBe(';30,45')
    expect(buildBearingsParam(2, end(2))?.split(';')).toHaveLength(2)
    expect(buildBearingsParam(3, end(3))).toBe(';;30,45')
  })

  it('returns null when nothing is constrained, and handles a start-only constraint', () => {
    expect(buildBearingsParam(2, [])).toBeNull()
    expect(buildBearingsParam(2, null)).toBeNull()
    expect(buildBearingsParam(2, [{ index: 0, bearingDeg: 30, rangeDeg: 45 }])).toBe('30,45;')
  })

  it('accepts bearing 0 and 360, range 0 and 180', () => {
    expect(buildBearingsParam(2, end(2, 0, 0))).toBe(';0,0')
    expect(buildBearingsParam(2, end(2, 360, 180))).toBe(';360,180')
  })

  it('rejects bearing 361, -1, 30.5; range 181, -1; an index out of range; duplicates', () => {
    expect(() => buildBearingsParam(2, end(2, 361))).toThrow(RangeError)
    expect(() => buildBearingsParam(2, end(2, -1))).toThrow(RangeError)
    expect(() => buildBearingsParam(2, end(2, 30.5))).toThrow(RangeError)
    expect(() => buildBearingsParam(2, end(2, 30, 181))).toThrow(RangeError)
    expect(() => buildBearingsParam(2, end(2, 30, -1))).toThrow(RangeError)
    expect(() => buildBearingsParam(2, [{ index: 2, bearingDeg: 30, rangeDeg: 45 }])).toThrow(RangeError)
    expect(() => buildBearingsParam(2, [...end(2), ...end(2)])).toThrow(RangeError)
  })
})

describe('validateApproach', () => {
  const ok = { coordinate: 'end', bearingDeg: 30, rangeDeg: 45, source: 's', reason: 'r', addedBy: 'a', addedOn: '2026-11-17' }
  it('accepts a complete approach, including bearing 360', () => {
    expect(validateApproach(ok)).toEqual([])
    expect(validateApproach({ ...ok, bearingDeg: 360 })).toEqual([])
  })
  it('rejects bad values and missing provenance', () => {
    expect(validateApproach({ ...ok, bearingDeg: 361 })).not.toEqual([])
    expect(validateApproach({ ...ok, rangeDeg: 181 })).not.toEqual([])
    expect(validateApproach({ ...ok, coordinate: 'start' })).not.toEqual([])
    expect(validateApproach({ ...ok, source: '' })).not.toEqual([])
    expect(validateApproach({ ...ok, addedOn: undefined })).not.toEqual([])
  })
})

describe('corridor config (src/lib/routeChecks.js, re-exported by scripts/routes.config.mjs)', () => {
  it('matches the campus location and endpoints in alangilan.ts', () => {
    expect(CAMPUS).toEqual(alangilan.location)
    for (const c of CORRIDORS) {
      // The generator's endpoints are those of the hand-drawn paths (the drawn paths now follow roads).
      const app = ALANGILAN_HAND_DRAWN_CORRIDORS.find((x) => x.id === c.id)
      expect(app, c.id).toBeDefined()
      expect(c.end).toEqual(app!.path[app!.path.length - 1])
      expect(c.appViaLabel).toBe(app!.via)
    }
    // Formal scope: the original five lead the app's list (Rosario, added later, is outside formal review).
    expect(alangilan.corridors.map((c) => c.id).slice(0, CORRIDORS.length)).toEqual(CORRIDORS.map((c) => c.id))
  })

  it('applies a bearing only to the San Jose destination coordinate', () => {
    expect(CORRIDORS.filter((c) => c.approach).map((c) => c.id)).toEqual(['sanjose'])
    const sj = CORRIDORS.find((c) => c.id === 'sanjose')!
    expect(sj.approach).toMatchObject({ coordinate: 'end', bearingDeg: 30, rangeDeg: 45 })
    expect(validateApproach(sj.approach)).toEqual([])
    const coordCount = 2 + sj.vias.length
    const { bearingDeg: b, rangeDeg: r } = sj.approach!
    expect(buildBearingsParam(coordCount, [{ index: coordCount - 1, bearingDeg: b, rangeDeg: r }])).toBe(';30,45')
  })

  it('keeps Lipa and Tanauan partial, adds no via-points, and enables the auxiliary measure only for San Jose', () => {
    expect(Object.fromEntries(CORRIDORS.map((c) => [c.id, c.pathEnds]))).toEqual({
      lipa: 'partial', batangas: null, bauan: null, sanjose: null, tanauan: 'partial',
    })
    for (const c of CORRIDORS) expect(c.vias).toEqual([])
    expect(CORRIDORS.filter((c) => c.auxSnappedEndExcess).map((c) => c.id)).toEqual(['sanjose'])
  })

  it('names primary roads (not refs) for every corridor', () => {
    for (const c of CORRIDORS) {
      expect(c.primaryRoads.length).toBeGreaterThan(0)
      for (const r of c.primaryRoads) expect(r.name).not.toMatch(/^[A-Z]?\d+(-\d+)?$/)
    }
  })
})

describe('detectCampusExit', () => {
  const steps: Step[] = [
    { name: '', distanceM: 132.5 }, { name: 'Neptune Street', distanceM: 410.1 }, { name: 'Mercury Street', distanceM: 271 },
    { name: 'National Highway 4', ref: '4', distanceM: 1212.4 }, { name: 'Neptune Street', distanceM: 99 },
  ]
  it('finds unnamed / Neptune / Mercury steps before the first primary road', () => {
    const r = detectCampusExit(steps, CAMPUS_ACCESS_ROADS, [{ label: 'NH4', name: 'National Highway 4' }])
    expect(r.usesAccessRoads).toBe(true)
    expect(r.steps.map((s) => s.name)).toEqual([null, 'Neptune Street', 'Mercury Street'])
    expect(r.distanceM).toBeCloseTo(813.6, 6)
  })
  it('reports no access-road use when none appears before the first primary road', () => {
    expect(detectCampusExit([{ name: 'National Highway 4', distanceM: 10 }, ...steps], CAMPUS_ACCESS_ROADS, [{ label: 'NH4', name: 'National Highway 4' }]).usesAccessRoads).toBe(false)
  })
})

describe('findPositiveClaims (wording guard)', () => {
  it.each([
    'Every status here is not verified, not confirmed, not approved and not production-ready.',
    'CANDIDATE — NOT APPROVED',
    'This route was never confirmed.',
    'approved: false,',
    '"approved": false',
    '- [ ] Approved for Phase 2 (name, date):',
    'Unverified access road',
  ])('allows: %s', (text) => {
    expect(findPositiveClaims(text)).toEqual([])
  })

  it.each([
    'Route verified',
    'approved: true',
    'These are production-ready routes',
    '- [x] Approved for Phase 2',
    'The approach is confirmed by the bearing',
  ])('rejects: %s', (text) => {
    expect(findPositiveClaims(text)).not.toEqual([])
  })

  it('reports the line number of each claim', () => {
    expect(findPositiveClaims('fine\nnot verified\nRoute verified')).toEqual([{ line: 3, word: 'verified', text: 'Route verified' }])
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Phase 2 approval validation
// ═══════════════════════════════════════════════════════════════════════════

const enc = (s: string) => new TextEncoder().encode(s)
const subtleHex = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ])('known vector %j', (input, hex) => {
    expect(sha256Hex(enc(input))).toBe(hex)
  })

  it('matches Web Crypto for every length 0–200 and a multi-kilobyte input', async () => {
    for (let n = 0; n <= 200; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 31 + n) & 0xff)
      expect(sha256Hex(bytes)).toBe(await subtleHex(bytes))
    }
    const big = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7) & 0xff)
    expect(sha256Hex(big)).toBe(await subtleHex(big))
  })

  it('rejects non-byte input', () => {
    expect(() => sha256Hex('abc' as unknown as Uint8Array)).toThrow(TypeError)
  })
})

describe('application path serialization and hash', () => {
  const C: LatLng = [13.7842, 121.0744]

  it('serializes exactly: campus first, lat,lng, 5 decimals, ";" separators, no whitespace or trailing separator', () => {
    expect(serializeAppPath([C, [13.78419, 121.07428], [13.8, 121.1]], C))
      .toBe('gp-1|latlng|5|13.78420,121.07440;13.78419,121.07428;13.80000,121.10000')
  })

  it('writes negative zero as 0.00000', () => {
    expect(serializeAppPath([C, [-0, 121.1]], C)).toBe('gp-1|latlng|5|13.78420,121.07440;0.00000,121.10000')
    expect(serializeAppPath([C, [-0, 121.1]], C)).toBe(serializeAppPath([C, [0, 121.1]], C))
  })

  it('rejects values not already rounded to 5 decimals (never rounds silently)', () => {
    expect(() => serializeAppPath([C, [13.784211, 121.07]], C)).toThrow(/not rounded/)
  })

  it.each([
    ['NaN', [NaN, 121]], ['Infinity', [13.8, Infinity]], ['latitude out of range', [91, 121]],
    ['longitude out of range', [13.8, 181]], ['three values', [13.8, 121, 0]], ['string value', ['13.8', 121]],
  ])('rejects an invalid coordinate: %s', (_label, p) => {
    expect(() => serializeAppPath([C, p as unknown as LatLng], C)).toThrow()
  })

  it('requires the campus anchor first, exactly once, plus at least one road point', () => {
    expect(() => serializeAppPath([[13.8, 121.1], C], C)).toThrow(/must start at the campus/)
    expect(() => serializeAppPath([C, C, [13.8, 121.1]], C)).toThrow(/Duplicate campus anchor at point 1/)
    expect(() => serializeAppPath([C, [13.8, 121.1], C], C)).toThrow(/Duplicate campus anchor at point 2/)
    expect(() => serializeAppPath([C], C)).toThrow(TypeError)
  })

  it('buildAppPath prepends the campus and refuses a road path that already has it', () => {
    expect(buildAppPath(C, [[13.8, 121.1]])).toEqual([C, [13.8, 121.1]])
    expect(() => buildAppPath(C, [C, [13.8, 121.1]])).toThrow(/already starts with the campus/)
    expect(() => buildAppPath(C, [])).toThrow(TypeError)
  })

  it('hashes the exact UTF-8 serialization; stable, order-sensitive and precision-sensitive', async () => {
    const path: LatLng[] = [C, [13.78419, 121.07428], [13.8, 121.1]]
    expect(routeGeometryHash(path, C)).toBe(await subtleHex(enc(serializeAppPath(path, C))))
    expect(routeGeometryHash(structuredClone(path), C)).toBe(routeGeometryHash(path, C))
    expect(routeGeometryHash([C, [13.8, 121.1], [13.78419, 121.07428]], C)).not.toBe(routeGeometryHash(path, C))
    expect(routeGeometryHash([C, [13.78418, 121.07428], [13.8, 121.1]], C)).not.toBe(routeGeometryHash(path, C))
  })
})

describe('recordSha256 and geojsonSha256', () => {
  const json = '{\n  "routeId": "lipa"\n}\n'

  it('record hash: LF and CRLF content hash the same (string or bytes)', () => {
    const crlf = json.replace(/\n/g, '\r\n')
    expect(recordSha256(crlf)).toBe(recordSha256(json))
    expect(recordSha256(enc(crlf))).toBe(recordSha256(enc(json)))
    expect(recordSha256(json)).toBe(sha256Hex(enc(json)))
  })

  it('record hash: any content change changes the hash', () => {
    expect(recordSha256(json.replace('lipa', 'lipb'))).not.toBe(recordSha256(json))
  })

  it('record hash: rejects a byte-order mark, invalid UTF-8 and lone CR instead of repairing them', () => {
    expect(() => recordSha256(`\uFEFF${json}`)).toThrow(/byte-order mark/)
    expect(() => recordSha256(Uint8Array.from([0xef, 0xbb, 0xbf, ...enc(json)]))).toThrow(/byte-order mark/)
    expect(() => recordSha256(Uint8Array.from([0x7b, 0xff, 0x7d]))).toThrow(/not valid UTF-8/)
    expect(() => recordSha256('{\r"a": 1}')).toThrow(/carriage return/)
  })

  it('GeoJSON hash is byte-exact: no newline normalization, text input refused', async () => {
    const lf = enc('{"type":"FeatureCollection"}\n')
    const crlf = enc('{"type":"FeatureCollection"}\r\n')
    expect(geojsonSha256(lf)).toBe(await subtleHex(lf))
    expect(geojsonSha256(lf)).not.toBe(geojsonSha256(crlf))
    expect(geojsonSha256(lf.buffer.slice(0))).toBe(geojsonSha256(lf))
    expect(() => geojsonSha256('{}' as unknown as Uint8Array)).toThrow(/exact file bytes/)
  })
})

// ── Warnings ────────────────────────────────────────────────────────────────

const VALID_WARNINGS: Record<string, RouteWarning> = {
  'campus-exit-unverified': { code: 'campus-exit-unverified', text: 'campus exit unresolved', value: { distanceM: 814, roads: ['(unnamed)', 'Neptune Street', 'Mercury Street'] } },
  'destination-overshoot': { code: 'destination-overshoot', text: 'destination overshoot 430 m', value: 430 },
  'endpoint-zone-not-reached': { code: 'endpoint-zone-not-reached', text: 'zone not reached', value: 100 },
  'endpoint-snap': { code: 'endpoint-snap', text: 'endpoint snap 203 m', value: 203 },
  'start-snap': { code: 'start-snap', text: 'start snap 160 m', value: 160 },
  'snap-bearing-applied': { code: 'snap-bearing-applied', text: 'bearing applied', value: { bearingDeg: 30, rangeDeg: 45 } },
  'snapped-endpoint-loop': { code: 'snapped-endpoint-loop', text: 'loop', value: 4908 },
  'connector-long': { code: 'connector-long', text: 'connector 320 m', value: 320 },
  'near-straight': { code: 'near-straight', text: 'near straight', value: 1.01 },
  'weak-road-evidence': { code: 'weak-road-evidence', text: 'weak evidence 12%', value: 0.117 },
}

describe('warning schema (ws-1)', () => {
  it('has rules for exactly the codes in the warning schema, in the same order', () => {
    expect(Object.keys(WARNING_RULES)).toEqual([...WARNING_SCHEMA_PARAMS.codes])
    expect(WARNING_CODES).toEqual([...WARNING_SCHEMA_PARAMS.codes])
  })

  it('takes its evidence policy from the approval schema (pinned under as-1 in routeVersions.test.ts), not a local copy', () => {
    const p = APPROVAL_SCHEMA_PARAMS
    for (const code of WARNING_CODES) {
      expect(WARNING_RULES[code].evidenceTypes).toBe(p.evidenceResolution[code])
      expect(WARNING_RULES[code].sharedEvidence).toBe(code === p.campusExit.warningCode)
      expect(WARNING_RULES[code].endpointRelationship).toBe(p.endpointWarnings.codes.includes(code as never))
    }
    expect(ENDPOINT_WARNING_CODES).toBe(p.endpointWarnings.codes)
    expect(WARNING_RULES['campus-exit-unverified']).toMatchObject({ evidenceTypes: ['on-site-inspection'], sharedEvidence: true })
    for (const code of ENDPOINT_WARNING_CODES) expect(WARNING_RULES[code].evidenceTypes).not.toContain('team-decision')
  })

  it.each(Object.keys(VALID_WARNINGS))('accepts a well-formed %s warning', (code) => {
    expect(validateWarning(VALID_WARNINGS[code])).toEqual([])
  })

  it.each([
    ['unknown code', { code: 'mystery', text: 't', value: 1 }, /unknown warning code/],
    ['extra field', { ...VALID_WARNINGS['endpoint-snap'], note: 'x' }, /exactly the fields/],
    ['missing value', { code: 'endpoint-snap', text: 't' }, /exactly the fields/],
    ['empty text', { ...VALID_WARNINGS['endpoint-snap'], text: ' ' }, /text must be/],
    ['negative metres', { ...VALID_WARNINGS['endpoint-snap'], value: -1 }, /value does not match/],
    ['campus exit without roads', { ...VALID_WARNINGS['campus-exit-unverified'], value: { distanceM: 814, roads: [] } }, /value does not match/],
    ['share above 1', { ...VALID_WARNINGS['weak-road-evidence'], value: 1.5 }, /value does not match/],
    ['bearing without range', { ...VALID_WARNINGS['snap-bearing-applied'], value: { bearingDeg: 30 } }, /value does not match/],
  ])('rejects %s', (_label, w, message) => {
    expect(validateWarning(w).join('\n')).toMatch(message)
  })

  it('rejects duplicate codes on one route and non-array lists', () => {
    expect(validateWarningList([VALID_WARNINGS['endpoint-snap'], VALID_WARNINGS['endpoint-snap']]).join('\n')).toMatch(/duplicate warning code endpoint-snap/)
    expect(validateWarningList('x')).toEqual(['warnings: must be an array'])
    expect(validateWarningList(Object.values(VALID_WARNINGS))).toEqual([])
  })
})

// ── Fixtures for records, evidence and sets ─────────────────────────────────

const RUN_ID = '20261201T000000Z-abc123'
const GEOJSON_BYTES = enc('{"type":"FeatureCollection","features":[]}\n')
const GEOJSON_HASH = geojsonSha256(GEOJSON_BYTES)
const C0 = CAMPUS
const ROAD_PATHS: Record<string, LatLng[]> = {
  lipa: [[13.78419, 121.07428], [13.79, 121.07], [13.81006, 121.07]],
  batangas: [[13.78419, 121.07428], [13.77, 121.064], [13.75752, 121.0581]],
  bauan: [[13.78419, 121.07428], [13.786, 121.045], [13.79019, 121.0197]],
  sanjose: [[13.78419, 121.07428], [13.805, 121.1], [13.8191, 121.11663]],
  tanauan: [[13.78419, 121.07428], [13.82, 121.085], [13.85073, 121.09496]],
}
const SNAPPED: Record<string, LatLng> = Object.fromEntries(Object.entries(ROAD_PATHS).map(([k, p]) => [k, p[p.length - 1]]))
const GEOM_HASH: Record<string, string> = Object.fromEntries(Object.entries(ROAD_PATHS).map(([k, p]) => [k, routeGeometryHash(buildAppPath(C0, p), C0)]))
const RUN_WARNINGS: Record<string, RouteWarning[]> = {
  lipa: [VALID_WARNINGS['campus-exit-unverified']],
  batangas: [VALID_WARNINGS['campus-exit-unverified']],
  bauan: [VALID_WARNINGS['destination-overshoot'], VALID_WARNINGS['campus-exit-unverified']],
  sanjose: [VALID_WARNINGS['endpoint-snap'], VALID_WARNINGS['endpoint-zone-not-reached'], VALID_WARNINGS['snap-bearing-applied'], VALID_WARNINGS['campus-exit-unverified']],
  tanauan: [VALID_WARNINGS['campus-exit-unverified']],
}
// Files the fixtures cite as evidence, treated as committed in this simulated repository. Resolution
// evidenceRefs are checked too, so the files they name must be listed here.
const COMMITTED = new Set([
  'docs/routes/approvals/evidence/campus-exit-photos.md',
  'docs/routes/approvals/evidence/alangilan-campus-exit.json',
  'docs/routes/alangilan-review-notes.md',
])

const makeEvidence = (): SharedEvidence => ({
  approvalSchemaVersion: 'as-1',
  evidenceId: 'alangilan-campus-exit-20261201',
  evidenceType: 'on-site-inspection',
  subject: 'Campus exit via unnamed road, Neptune Street, Mercury Street',
  segmentsInspected: ['(unnamed)', 'Neptune Street', 'Mercury Street'],
  inspectedOn: '2026-12-01',
  inspectedBy: 'Campus DRRMO staff (role)',
  publicAccess: { status: 'public-with-conditions', conditions: 'Gate open 05:00–22:00', finding: 'Open to the public through the side gate.' },
  usability: { status: 'usable', finding: 'Paved, lit, passable on foot and by tricycle.' },
  evidenceRefs: ['https://example.org/biyahe/campus-exit-2026-12-01', 'docs/routes/approvals/evidence/campus-exit-photos.md'],
  appliesToRoutes: ['lipa', 'batangas', 'bauan', 'sanjose', 'tanauan'],
  limitations: 'Inspected on one weekday morning.',
})

const configFor = (id: string) => {
  const c = CORRIDORS.find((x) => x.id === id)!
  return { end: c.end, pathEnds: c.pathEnds }
}

function makeRecord(id: string, ev: SharedEvidence = makeEvidence()): ApprovalRecord {
  const base = { reviewer: 'Project team (role)', reviewedOn: '2026-12-02', runId: RUN_ID, routeGeometrySha256: GEOM_HASH[id] }
  const end = configFor(id).end
  const resolutions = RUN_WARNINGS[id].map((w) => {
    if (w.code === 'campus-exit-unverified') {
      return { ...base, warningCode: w.code, outcome: 'accepted-limitation', resolution: 'Accepted under the documented gate hours.',
        evidenceType: 'on-site-inspection', evidenceRef: 'docs/routes/approvals/evidence/alangilan-campus-exit.json',
        sharedEvidenceId: ev.evidenceId, conditionsAcknowledged: evidenceConditions(ev) }
    }
    if (w.code === 'endpoint-snap' || w.code === 'endpoint-zone-not-reached') {
      return { ...base, warningCode: w.code, outcome: 'accepted-limitation', resolution: 'The snapped point serves the intended exit.',
        evidenceType: 'map-review', evidenceRef: 'docs/routes/alangilan-review-notes.md',
        endpointRelationship: { requestedEndpoint: end, acceptedEndpoint: SNAPPED[id], separationM: haversineM(end, SNAPPED[id]),
          intendedDestination: 'San Jose–Ibaan interchange area', relationship: 'Nearest point on the northbound carriageway to the requested point.' } }
    }
    return { ...base, warningCode: w.code, outcome: 'accepted-limitation', resolution: 'Visually acceptable for continued evaluation.',
      evidenceType: 'map-review', evidenceRef: 'docs/routes/alangilan-review-notes.md' }
  })
  return {
    ...VERSIONS, campus: 'alangilan', routeId: id, runId: RUN_ID, geojsonSha256: GEOJSON_HASH, routeGeometrySha256: GEOM_HASH[id],
    pathEnds: configFor(id).pathEnds, reviewedBy: 'Project team (role)', reviewedOn: '2026-12-02',
    warnings: structuredClone(RUN_WARNINGS[id]), resolutions, history: [],
  }
}

const makeRun = () => ({
  runId: RUN_ID, geojsonSha256: GEOJSON_HASH, versions: { ...VERSIONS },
  routes: Object.fromEntries(CORRIDORS.map((c) => [c.id, {
    status: 'NEEDS REVIEW', warnings: structuredClone(RUN_WARNINGS[c.id]), routeGeometrySha256: GEOM_HASH[c.id], snappedEnd: SNAPPED[c.id],
  }])),
})

const recordCtx = (id: string, ev: SharedEvidence = makeEvidence(), local = true) => {
  const run = makeRun()
  return {
    routeId: id, config: configFor(id), sharedEvidence: ev, sharedEvidenceResult: validateSharedEvidence(ev, { committedFiles: COMMITTED }),
    committedFiles: COMMITTED, run: local ? { runId: run.runId, geojsonSha256: run.geojsonSha256, versions: run.versions, ...run.routes[id] } : null,
  }
}
const problemsOf = (rec: unknown, ctx: ReturnType<typeof recordCtx>) => validateApprovalRecord(rec, ctx).problems.join('\n')

// ── Shared campus-exit evidence ─────────────────────────────────────────────

describe('validateSharedEvidence', () => {
  it('accepts complete accepting evidence', () => {
    expect(validateSharedEvidence(makeEvidence(), { committedFiles: COMMITTED })).toEqual({ valid: true, accepting: true, problems: [] })
  })

  const statuses = (publicAccess: string, usability: string) => {
    const ev = makeEvidence()
    ev.publicAccess = { status: publicAccess, finding: 'f', ...(publicAccess.endsWith('-with-conditions') ? { conditions: 'c' } : {}) }
    ev.usability = { status: usability, finding: 'f', ...(usability.endsWith('-with-conditions') ? { conditions: 'c' } : {}) }
    return validateSharedEvidence(ev, { committedFiles: COMMITTED })
  }

  it.each([
    ['public', 'usable', true], ['public-with-conditions', 'usable', true], ['public', 'usable-with-conditions', true],
    ['public-with-conditions', 'usable-with-conditions', true],
    ['restricted', 'usable', false], ['private', 'usable', false], ['blocked', 'usable', false], ['unknown', 'usable', false],
    ['public', 'unusable', false], ['public', 'unknown', false], ['blocked', 'unusable', false],
  ])('public access %s + usability %s → accepting %s', (pa, us, accepting) => {
    const r = statuses(pa, us)
    expect(r.valid).toBe(true)
    expect(r.accepting).toBe(accepting)
  })

  it('requires conditions when a finding is conditional', () => {
    const ev = makeEvidence()
    delete ev.publicAccess.conditions
    expect(validateSharedEvidence(ev, { committedFiles: COMMITTED }).problems.join('\n')).toMatch(/publicAccess.conditions are required/)
    const ev2 = makeEvidence()
    ev2.usability = { status: 'usable-with-conditions', finding: 'f' }
    expect(validateSharedEvidence(ev2, { committedFiles: COMMITTED }).problems.join('\n')).toMatch(/usability.conditions are required/)
  })

  it.each([
    ['wrong evidence type', (e: SharedEvidence) => { e.evidenceType = 'map-review' }, /evidenceType must be on-site-inspection/],
    ['bad schema version', (e: SharedEvidence) => { e.approvalSchemaVersion = 'as-0' }, /approvalSchemaVersion/],
    ['bad evidence ID', (e: SharedEvidence) => { e.evidenceId = 'Campus Exit!' }, /evidenceId/],
    ['bad date', (e: SharedEvidence) => { e.inspectedOn = '2026-02-30' }, /inspectedOn/],
    ['missing inspector', (e: SharedEvidence) => { e.inspectedBy = '' }, /inspectedBy/],
    ['missing public-access finding', (e: SharedEvidence) => { e.publicAccess.finding = '' }, /publicAccess.finding/],
    ['missing usability finding', (e: SharedEvidence) => { e.usability.finding = '' }, /usability.finding/],
    ['unknown status', (e: SharedEvidence) => { e.usability.status = 'fine' }, /usability.status/],
    ['no segments', (e: SharedEvidence) => { e.segmentsInspected = [] }, /segmentsInspected/],
    ['unknown route', (e: SharedEvidence) => { e.appliesToRoutes = ['lipa', 'malvar'] }, /unknown route malvar/],
    ['no references', (e: SharedEvidence) => { e.evidenceRefs = [] }, /evidenceRefs/],
  ])('rejects %s', (_label, edit, message) => {
    const ev = makeEvidence()
    edit(ev)
    expect(validateSharedEvidence(ev, { committedFiles: COMMITTED }).problems.join('\n')).toMatch(message)
  })

  it.each([
    'C:\\Users\\me\\photos\\exit.jpg', 'C:/Users/me/exit.jpg', '/home/me/exit.jpg', '~/exit.jpg', '\\\\server\\share\\exit.jpg',
    'file:///C:/exit.jpg', 'http://example.org/exit', 'ftp://example.org/exit', 'docs/../exit.jpg', './docs/exit.jpg',
    'docs\\exit.jpg', 'docs/routes/approvals/evidence/not-committed.jpg', '',
  ])('rejects a reference reviewers cannot open: %j', (ref) => {
    expect(checkEvidenceRef(ref, COMMITTED)).not.toBeNull()
  })

  it('accepts https URLs and committed repository paths; repo paths need the committed file list', () => {
    expect(checkEvidenceRef('https://example.org/biyahe/exit', COMMITTED)).toBeNull()
    expect(checkEvidenceRef('docs/routes/approvals/evidence/campus-exit-photos.md', COMMITTED)).toBeNull()
    expect(checkEvidenceRef('docs/routes/approvals/evidence/campus-exit-photos.md', undefined)).toMatch(/cannot confirm/)
  })
})

// ── Route records ───────────────────────────────────────────────────────────

describe('validateApprovalRecord', () => {
  it.each(CORRIDORS.map((c) => c.id))('accepts a complete valid record for %s (local mode)', (id) => {
    expect(validateApprovalRecord(makeRecord(id), recordCtx(id))).toEqual({ valid: true, activatable: true, problems: [], blockers: [] })
  })

  it('requires the expected route ID and campus', () => {
    expect(problemsOf({ ...makeRecord('lipa'), routeId: 'bauan' }, recordCtx('lipa'))).toMatch(/expected lipa/)
    expect(problemsOf({ ...makeRecord('lipa'), campus: 'malvar' }, recordCtx('lipa'))).toMatch(/campus must be alangilan/)
  })

  it('rejects unknown and missing fields', () => {
    const { history: _h, ...missing } = makeRecord('lipa')
    expect(problemsOf(missing, recordCtx('lipa'))).toMatch(/missing field history/)
    expect(problemsOf({ ...makeRecord('lipa'), approvedBy: 'x' }, recordCtx('lipa'))).toMatch(/unknown field approvedBy/)
  })

  it('rejects incompatible versions but ignores the informational generator version', () => {
    expect(problemsOf({ ...makeRecord('lipa'), routingPolicyVersion: 'rp-2' }, recordCtx('lipa'))).toMatch(/routingPolicyVersion/)
    expect(problemsOf({ ...makeRecord('lipa'), geometryProcessingVersion: 'gp-0' }, recordCtx('lipa'))).toMatch(/geometryProcessingVersion/)
    expect(validateApprovalRecord({ ...makeRecord('lipa'), generatorVersion: '9.9.9' }, recordCtx('lipa')).valid).toBe(true)
  })

  it('rejects run, GeoJSON and geometry hash mismatches with the diagnostic run', () => {
    expect(problemsOf({ ...makeRecord('lipa'), runId: 'other' }, recordCtx('lipa'))).toMatch(/does not match the diagnostic run/)
    expect(problemsOf({ ...makeRecord('lipa'), geojsonSha256: 'f'.repeat(64) }, recordCtx('lipa'))).toMatch(/geojsonSha256 does not match/)
    expect(problemsOf({ ...makeRecord('lipa'), routeGeometrySha256: GEOM_HASH.bauan }, recordCtx('lipa'))).toMatch(/routeGeometrySha256 does not match/)
    expect(problemsOf({ ...makeRecord('lipa'), routeGeometrySha256: 'xyz' }, recordCtx('lipa'))).toMatch(/SHA-256 hex digest/)
  })

  it('rejects a route the run reports as FAILED', () => {
    const ctx = recordCtx('lipa')
    ctx.run!.status = 'FAILED'
    expect(problemsOf(makeRecord('lipa'), ctx)).toMatch(/FAILED route cannot be approved/)
  })

  it('requires warnings copied verbatim from the run, with none missing or extra', () => {
    const altered = makeRecord('bauan')
    altered.warnings[0] = { ...altered.warnings[0], value: 300 }
    expect(problemsOf(altered, recordCtx('bauan'))).toMatch(/destination-overshoot is not copied verbatim/)
    const retexted = makeRecord('bauan')
    retexted.warnings[0] = { ...retexted.warnings[0], text: 'overshoot is fine' }
    expect(problemsOf(retexted, recordCtx('bauan'))).toMatch(/not copied verbatim/)
    const missing = makeRecord('bauan')
    missing.warnings = missing.warnings.filter((w) => w.code !== 'destination-overshoot')
    missing.resolutions = missing.resolutions.filter((r) => r.warningCode !== 'destination-overshoot')
    expect(problemsOf(missing, recordCtx('bauan'))).toMatch(/warning destination-overshoot from the diagnostic run is missing/)
    const extra = makeRecord('lipa')
    extra.warnings.push(VALID_WARNINGS['near-straight'])
    extra.resolutions.push({ ...extra.resolutions[0], warningCode: 'near-straight', evidenceType: 'map-review', sharedEvidenceId: undefined } as never)
    expect(problemsOf(extra, recordCtx('lipa'))).toMatch(/near-straight is not reported by the diagnostic run/)
  })

  it('requires exactly one resolution per current warning', () => {
    const missing = makeRecord('bauan')
    missing.resolutions = missing.resolutions.filter((r) => r.warningCode !== 'destination-overshoot')
    expect(problemsOf(missing, recordCtx('bauan'))).toMatch(/warning destination-overshoot has no resolution/)
    const dup = makeRecord('bauan')
    dup.resolutions.push(structuredClone(dup.resolutions[0]))
    expect(problemsOf(dup, recordCtx('bauan'))).toMatch(/more than one resolution for destination-overshoot/)
    const stray = makeRecord('lipa')
    stray.resolutions.push({ ...makeRecord('bauan').resolutions[0], routeGeometrySha256: GEOM_HASH.lipa })
    expect(problemsOf(stray, recordCtx('lipa'))).toMatch(/resolves "destination-overshoot", which is not a current warning/)
  })

  it('outcomes: accepted-limitation activates; unresolved is valid but blocks; corrected and unknown are rejected', () => {
    const unresolved = makeRecord('bauan')
    unresolved.resolutions[0].outcome = 'unresolved'
    const r = validateApprovalRecord(unresolved, recordCtx('bauan'))
    expect(r).toMatchObject({ valid: true, activatable: false })
    expect(r.blockers.join('\n')).toMatch(/destination-overshoot is unresolved/)
    const corrected = makeRecord('bauan')
    corrected.resolutions[0].outcome = 'corrected'
    expect(problemsOf(corrected, recordCtx('bauan'))).toMatch(/current warning cannot be marked corrected/)
    const unknown = makeRecord('bauan')
    unknown.resolutions[0].outcome = 'waived'
    expect(problemsOf(unknown, recordCtx('bauan'))).toMatch(/outcome must be accepted-limitation or unresolved/)
  })

  it('evidence types must be allowed for the warning being resolved', () => {
    const teamEndpoint = makeRecord('sanjose')
    teamEndpoint.resolutions.find((x) => x.warningCode === 'endpoint-snap')!.evidenceType = 'team-decision'
    expect(problemsOf(teamEndpoint, recordCtx('sanjose'))).toMatch(/team-decision cannot resolve endpoint-snap/)
    const teamZone = makeRecord('sanjose')
    teamZone.resolutions.find((x) => x.warningCode === 'endpoint-zone-not-reached')!.evidenceType = 'team-decision'
    expect(problemsOf(teamZone, recordCtx('sanjose'))).toMatch(/team-decision cannot resolve endpoint-zone-not-reached/)
    const mapCampus = makeRecord('lipa')
    mapCampus.resolutions[0].evidenceType = 'map-review'
    expect(problemsOf(mapCampus, recordCtx('lipa'))).toMatch(/map-review cannot resolve campus-exit-unverified/)
    const unknownType = makeRecord('bauan')
    unknownType.resolutions[0].evidenceType = 'hearsay'
    expect(problemsOf(unknownType, recordCtx('bauan'))).toMatch(/unknown evidenceType/)
  })

  it('every resolution field is required and must match the record run and geometry hash', () => {
    const r = makeRecord('bauan')
    delete (r.resolutions[0] as Partial<ApprovalRecord['resolutions'][number]>).reviewer
    expect(problemsOf(r, recordCtx('bauan'))).toMatch(/missing field reviewer/)
    const r2 = makeRecord('bauan')
    r2.resolutions[0].runId = 'older-run'
    expect(problemsOf(r2, recordCtx('bauan'))).toMatch(/runId does not match the record/)
    const r3 = makeRecord('bauan')
    r3.resolutions[0].routeGeometrySha256 = GEOM_HASH.lipa
    expect(problemsOf(r3, recordCtx('bauan'))).toMatch(/routeGeometrySha256 does not match the record/)
  })

  describe('endpoint relationship (endpoint-snap, endpoint-zone-not-reached)', () => {
    const edited = (edit: (er: NonNullable<ApprovalRecord['resolutions'][number]['endpointRelationship']>) => void) => {
      const rec = makeRecord('sanjose')
      edit(rec.resolutions.find((x) => x.warningCode === 'endpoint-snap')!.endpointRelationship!)
      return rec
    }

    it('is required', () => {
      const rec = makeRecord('sanjose')
      delete rec.resolutions.find((x) => x.warningCode === 'endpoint-snap')!.endpointRelationship
      expect(problemsOf(rec, recordCtx('sanjose'))).toMatch(/endpointRelationship is required for endpoint-snap/)
    })

    it('requested endpoint must equal the configured endpoint (a new destination needs a config change and new run)', () => {
      expect(problemsOf(edited((er) => { er.requestedEndpoint = [13.83, 121.12] }), recordCtx('sanjose'))).toMatch(/requestedEndpoint must equal the configured endpoint/)
    })

    it('accepted endpoint must equal the snapped endpoint in the run (local mode)', () => {
      expect(problemsOf(edited((er) => { er.acceptedEndpoint = [13.819, 121.1166] }), recordCtx('sanjose'))).toMatch(/does not match the snapped endpoint/)
    })

    it('separation must match the measured distance within 1 m', () => {
      expect(problemsOf(edited((er) => { er.separationM += 5 }), recordCtx('sanjose'))).toMatch(/separationM .* does not match the measured/)
      expect(validateApprovalRecord(edited((er) => { er.separationM += 0.5 }), recordCtx('sanjose')).valid).toBe(true)
    })

    it('needs the intended destination and the explanation', () => {
      expect(problemsOf(edited((er) => { er.intendedDestination = '' }), recordCtx('sanjose'))).toMatch(/intendedDestination is required/)
      expect(problemsOf(edited((er) => { er.relationship = '' }), recordCtx('sanjose'))).toMatch(/relationship must explain/)
    })
  })

  describe('campus-exit resolution', () => {
    it('must reference the shared evidence by ID', () => {
      const rec = makeRecord('lipa')
      delete rec.resolutions[0].sharedEvidenceId
      expect(problemsOf(rec, recordCtx('lipa'))).toMatch(/must reference the shared evidence record/)
      const wrong = makeRecord('lipa')
      wrong.resolutions[0].sharedEvidenceId = 'some-other-evidence'
      expect(problemsOf(wrong, recordCtx('lipa'))).toMatch(/does not match the shared evidence record/)
    })

    it('the evidence must apply to the route and cover every segment named in the warning', () => {
      const ev = makeEvidence()
      ev.appliesToRoutes = ['batangas']
      expect(problemsOf(makeRecord('lipa', ev), recordCtx('lipa', ev))).toMatch(/does not list lipa in appliesToRoutes/)
      const ev2 = makeEvidence()
      ev2.segmentsInspected = ['(unnamed)', 'Neptune Street']
      expect(problemsOf(makeRecord('lipa', ev2), recordCtx('lipa', ev2))).toMatch(/does not cover segment "Mercury Street"/)
    })

    it('must repeat the evidence conditions exactly', () => {
      const rec = makeRecord('lipa')
      rec.resolutions[0].conditionsAcknowledged = { publicAccess: 'Gate open always', usability: null }
      expect(problemsOf(rec, recordCtx('lipa'))).toMatch(/conditionsAcknowledged must repeat/)
    })

    it.each(['restricted', 'private', 'blocked', 'unknown'])('public access %s cannot clear the warning, but may stay unresolved', (status) => {
      const ev = makeEvidence()
      ev.publicAccess = { status, finding: 'Found during inspection.' }
      expect(problemsOf(makeRecord('lipa', ev), recordCtx('lipa', ev))).toMatch(/does not establish public access and usability/)
      const rec = makeRecord('lipa', ev)
      rec.resolutions[0].outcome = 'unresolved'
      expect(validateApprovalRecord(rec, recordCtx('lipa', ev))).toMatchObject({ valid: true, activatable: false })
    })

    it.each(['unusable', 'unknown'])('usability %s cannot clear the warning', (status) => {
      const ev = makeEvidence()
      ev.usability = { status, finding: 'Found during inspection.' }
      expect(problemsOf(makeRecord('lipa', ev), recordCtx('lipa', ev))).toMatch(/does not establish public access and usability/)
    })

    it('other warnings may not reference the shared evidence', () => {
      const rec = makeRecord('bauan')
      rec.resolutions[0].sharedEvidenceId = 'alangilan-campus-exit-20261201'
      expect(problemsOf(rec, recordCtx('bauan'))).toMatch(/only the campus-exit warning may reference the shared evidence/)
    })
  })

  describe('history (corrected warnings from earlier runs)', () => {
    const entry = () => ({
      runId: '20261117T052515Z-1b3f27', warning: VALID_WARNINGS['snapped-endpoint-loop'], outcome: 'corrected',
      configChange: 'Destination snap bearing 30° ± 45° added to the San Jose config (routing policy rp-1).',
      resolution: 'The loop no longer occurs.', reviewer: 'Project team (role)', reviewedOn: '2026-12-02',
    })

    it('accepts a corrected warning from an earlier run with a documented config change', () => {
      const rec = makeRecord('sanjose')
      rec.history.push(entry())
      expect(validateApprovalRecord(rec, recordCtx('sanjose')).valid).toBe(true)
    })

    it.each([
      ['the current run', (h: ReturnType<typeof entry>) => { h.runId = RUN_ID }, /earlier run, not the current one/],
      ['no config change', (h: ReturnType<typeof entry>) => { h.configChange = '' }, /configChange must document/],
      ['a non-corrected outcome', (h: ReturnType<typeof entry>) => { h.outcome = 'accepted-limitation' }, /outcome corrected/],
      ['an invalid warning', (h: ReturnType<typeof entry>) => { h.warning = { code: 'mystery', text: 't', value: 1 } }, /unknown warning code/],
    ])('rejects a history entry with %s', (_label, edit, message) => {
      const rec = makeRecord('sanjose')
      const h = entry()
      edit(h)
      rec.history.push(h)
      expect(problemsOf(rec, recordCtx('sanjose'))).toMatch(message)
    })
  })

  it('rejects a partial-route flag that differs from the config', () => {
    expect(problemsOf({ ...makeRecord('lipa'), pathEnds: null }, recordCtx('lipa'))).toMatch(/pathEnds null does not match the configured "partial"/)
    expect(problemsOf({ ...makeRecord('batangas'), pathEnds: 'partial' }, recordCtx('batangas'))).toMatch(/pathEnds "partial" does not match/)
  })
})

// ── Full set ────────────────────────────────────────────────────────────────

describe('validateApprovalSet', () => {
  const records = () => CORRIDORS.map((c) => makeRecord(c.id))
  const local = (recs = records(), run = makeRun(), evidence: SharedEvidence = makeEvidence()) =>
    validateApprovalSet({ records: recs, evidence, corridors: CORRIDORS, committedFiles: COMMITTED, mode: 'local', run })
  const committed = (recs = records(), evidence: SharedEvidence = makeEvidence()) =>
    validateApprovalSet({ records: recs, evidence, corridors: CORRIDORS, committedFiles: COMMITTED, mode: 'committed' })

  it('a complete valid set passes in local mode with nothing left unverified', () => {
    expect(local()).toEqual({ mode: 'local-diagnostic-run', valid: true, activatable: true, problems: [], blockers: [], notVerified: [] })
  })

  it('committed mode validates the records but states what it could not verify', () => {
    const r = committed()
    expect(r).toMatchObject({ mode: 'committed-records-only', valid: true, activatable: true })
    expect(r.notVerified).toEqual([...NOT_VERIFIED_IN_COMMITTED_MODE])
    expect(r.notVerified.join('\n')).toMatch(/GeoJSON bytes/)
  })

  it('committed mode cannot detect a non-verbatim warning or accepted endpoint (listed as not verified)', () => {
    const recs = records()
    recs[2].warnings[0] = { ...recs[2].warnings[0], value: 300 }
    expect(committed(recs).valid).toBe(true)
    expect(local(recs).valid).toBe(false)
  })

  it('mode handling: committed mode refuses run data; local mode needs it', () => {
    expect(() => validateApprovalSet({ records: records(), evidence: makeEvidence(), corridors: CORRIDORS, mode: 'committed', run: makeRun() })).toThrow(TypeError)
    expect(validateApprovalSet({ records: records(), evidence: makeEvidence(), corridors: CORRIDORS, committedFiles: COMMITTED, mode: 'local' }).problems.join('\n'))
      .toMatch(/local mode needs the diagnostic run/)
    expect(() => validateApprovalSet({ records: [], evidence: null, corridors: CORRIDORS, mode: 'other' as 'local' })).toThrow(TypeError)
  })

  it('requires exactly the five Alangilan routes: missing, extra and duplicate records fail', () => {
    expect(local(records().slice(0, 4)).problems.join('\n')).toMatch(/missing record for route tanauan/)
    expect(local([...records(), { ...makeRecord('lipa'), routeId: 'pablo-borbon' }]).problems.join('\n')).toMatch(/unexpected record for route "pablo-borbon"/)
    expect(local([...records(), makeRecord('lipa')]).problems.join('\n')).toMatch(/duplicate record for route lipa/)
    expect(committed(records().slice(1)).problems.join('\n')).toMatch(/missing record for route lipa/)
  })

  it('rejects mixed diagnostic runs and mixed GeoJSON hashes', () => {
    const mixedRun = records()
    mixedRun[1] = { ...mixedRun[1], runId: 'other-run' }
    mixedRun[1].resolutions = mixedRun[1].resolutions.map((r) => ({ ...r, runId: 'other-run' }))
    expect(committed(mixedRun).problems.join('\n')).toMatch(/more than one diagnostic run/)
    const mixedHash = records()
    mixedHash[3] = { ...mixedHash[3], geojsonSha256: 'e'.repeat(64) }
    expect(committed(mixedHash).problems.join('\n')).toMatch(/more than one diagnostic GeoJSON hash/)
  })

  it('rejects version and hash mismatches against the run', () => {
    const run = makeRun()
    run.versions.warningSchemaVersion = 'ws-0'
    expect(local(records(), run).problems.join('\n')).toMatch(/run's warningSchemaVersion is not compatible/)
    const run2 = makeRun()
    run2.routes.bauan.routeGeometrySha256 = GEOM_HASH.lipa
    expect(local(records(), run2).problems.join('\n')).toMatch(/record bauan: routeGeometrySha256 does not match/)
    const run3 = makeRun()
    run3.geojsonSha256 = 'd'.repeat(64)
    expect(local(records(), run3).problems.join('\n')).toMatch(/geojsonSha256 does not match the diagnostic GeoJSON/)
    const recs = records()
    recs[0] = { ...recs[0], approvalSchemaVersion: 'as-2' }
    expect(committed(recs).problems.join('\n')).toMatch(/approvalSchemaVersion/)
  })

  it('rejects FAILED routes and routes missing from the run', () => {
    const run = makeRun()
    run.routes.tanauan.status = 'FAILED'
    expect(local(records(), run).problems.join('\n')).toMatch(/record tanauan: .*FAILED/)
    const run2 = makeRun()
    delete (run2.routes as Record<string, unknown>).batangas
    expect(local(records(), run2).problems.join('\n')).toMatch(/no data for route batangas/)
  })

  it('rejects partial-route flags that differ from the config (Lipa and Tanauan partial)', () => {
    const recs = records()
    recs[4] = { ...recs[4], pathEnds: null }
    expect(local(recs).problems.join('\n')).toMatch(/record tanauan: pathEnds null/)
  })

  it('any unresolved warning blocks activation', () => {
    const recs = records()
    recs[3].resolutions[0].outcome = 'unresolved'
    expect(local(recs)).toMatchObject({ valid: true, activatable: false })
  })

  it('incomplete or non-accepting shared evidence fails or blocks the whole set', () => {
    const incomplete = makeEvidence()
    incomplete.usability.finding = ''
    expect(local(records(), makeRun(), incomplete).valid).toBe(false)
    const blocked = makeEvidence()
    blocked.publicAccess = { status: 'blocked', finding: 'Gate locked.' }
    const recs = CORRIDORS.map((c) => {
      const r = makeRecord(c.id, blocked)
      for (const res of r.resolutions) if (res.warningCode === 'campus-exit-unverified') res.outcome = 'unresolved'
      return r
    })
    const result = local(recs, makeRun(), blocked)
    expect(result).toMatchObject({ valid: true, activatable: false })
    expect(result.blockers.join('\n')).toMatch(/does not establish public access and usability/)
  })
})

// ── Git state (pure) ────────────────────────────────────────────────────────

describe('validateCleanTracked (Git-state snapshot)', () => {
  const paths = ['docs/routes/approvals/alangilan/lipa.json', 'docs/routes/approvals/evidence/alangilan-campus-exit.json']
  const tracked = [...paths, 'src/App.tsx']

  it('clean when every path is tracked and unchanged', () => {
    expect(validateCleanTracked({ trackedFiles: tracked, porcelain: ' M src/App.tsx\n' }, paths)).toEqual({ clean: true, problems: [] })
  })

  it.each([
    ['untracked', '?? docs/routes/approvals/alangilan/lipa.json', /is untracked/],
    ['staged', 'M  docs/routes/approvals/alangilan/lipa.json', /staged changes/],
    ['unstaged', ' M docs/routes/approvals/alangilan/lipa.json', /unstaged changes/],
    ['staged and unstaged', 'MM docs/routes/approvals/alangilan/lipa.json', /staged changes[\s\S]*unstaged changes/],
    ['newly added', 'A  docs/routes/approvals/alangilan/lipa.json', /staged changes/],
    ['renamed into place', 'R  old.json -> docs/routes/approvals/alangilan/lipa.json', /staged changes/],
    ['deleted', ' D docs/routes/approvals/alangilan/lipa.json', /unstaged changes/],
  ])('unclean when the record is %s', (_label, porcelain, message) => {
    const r = validateCleanTracked({ trackedFiles: tracked, porcelain }, paths)
    expect(r.clean).toBe(false)
    expect(r.problems.join('\n')).toMatch(message)
  })

  it('unclean when a required path is not tracked at all', () => {
    expect(validateCleanTracked({ trackedFiles: ['src/App.tsx'], porcelain: '' }, paths).problems.join('\n')).toMatch(/is not tracked by Git/)
  })

  it('normalizes Windows separators and quoted paths', () => {
    expect(parsePorcelain(' M "docs\\routes\\a b.json"\r\n')).toEqual([{ status: ' M', path: 'docs/routes/a b.json' }])
    expect(validateCleanTracked({ trackedFiles: ['docs\\routes\\approvals\\alangilan\\lipa.json'], porcelain: '' }, ['docs/routes/approvals/alangilan/lipa.json']).clean).toBe(true)
  })
})

describe('parsePorcelainZ (-z output, exact paths)', () => {
  it('parses NUL-separated entries, keeps spaces and non-ASCII exactly, and skips rename sources', () => {
    const z = ' M docs/a b.json\0?? docs/ñ.json\0R  docs/new.json\0docs/old.json\0M  docs/c.json\0'
    expect(parsePorcelainZ(z)).toEqual([
      { status: ' M', path: 'docs/a b.json' },
      { status: '??', path: 'docs/ñ.json' },
      { status: 'R ', path: 'docs/new.json' },
      { status: 'M ', path: 'docs/c.json' },
    ])
  })

  it('validateCleanTracked uses the -z snapshot when given', () => {
    const paths = ['docs/a b.json']
    expect(validateCleanTracked({ trackedFiles: paths, porcelainZ: '' }, paths).clean).toBe(true)
    expect(validateCleanTracked({ trackedFiles: paths, porcelainZ: ' M docs/a b.json\0' }, paths).problems.join('\n')).toMatch(/unstaged changes/)
    expect(validateCleanTracked({ trackedFiles: [], porcelainZ: '?? docs/a b.json\0' }, paths).problems.join('\n')).toMatch(/is untracked/)
  })
})

// ── Strict JSON ─────────────────────────────────────────────────────────────

describe('parseStrictJson', () => {
  // A deterministic PRNG so the fuzz corpus is reproducible.
  const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
  const randomString = (r: () => number) => {
    const alphabet = ['a', 'Z', '0', ' ', '"', '\\', '/', '\n', '\t', '\u0000', '\u001f', 'é', 'ñ', '—', '😀', '\ud800', '__proto__', 'constructor']
    let s = ''
    for (let n = Math.floor(r() * 6); n > 0; n--) s += alphabet[Math.floor(r() * alphabet.length)]
    return s
  }
  const randomValue = (r: () => number, depth: number): unknown => {
    const pick = Math.floor(r() * (depth > 4 ? 5 : 7))
    if (pick === 0) return null
    if (pick === 1) return r() < 0.5
    if (pick === 2) return [0, -1, 1.5, -0.25, 1e21, 123456789012, 3.14159e-7, -2e-10][Math.floor(r() * 8)]
    if (pick === 3) return Math.round((r() - 0.5) * 1e6) / 1e3
    if (pick === 4) return randomString(r)
    if (pick === 5) return Array.from({ length: Math.floor(r() * 4) }, () => randomValue(r, depth + 1))
    const obj: Record<string, unknown> = {}
    for (let n = Math.floor(r() * 4); n > 0; n--) Object.defineProperty(obj, randomString(r) + n, { value: randomValue(r, depth + 1), enumerable: true, writable: true, configurable: true })
    return obj
  }

  it.each([
    '{}', '[]', '0', '-0', '1.5e+3', '-2E-10', '1e400', '"x"', 'true', 'false', 'null',
    ' { "a" : [ 1 , 2 , { "b" : null } ] , "c" : "d" } ',
    '{"u":"\\u00e9\\u2014\\ud83d\\ude00","esc":"\\"\\\\\\/\\b\\f\\n\\r\\t","lone":"\\ud800"}',
    '[[[[[[[[[[1]]]]]]]]]]', '{"big":123456789012345678901234567890}', '{"":1}',
    '{\n  "routeId": "lipa",\n  "warnings": []\n}\n',
  ])('matches JSON.parse on valid input %j', (text) => {
    expect(parseStrictJson(text)).toEqual(JSON.parse(text))
  })

  it('preserves negative zero exactly like JSON.parse', () => {
    expect(Object.is(parseStrictJson('-0'), -0)).toBe(true)
  })

  it('matches JSON.parse on 2,000 random documents (fixed seed)', () => {
    const r = rng(20261201)
    for (let k = 0; k < 2000; k++) {
      const value = randomValue(r, 0)
      const text = JSON.stringify(value, null, k % 3 === 0 ? 2 : undefined)
      expect(parseStrictJson(text)).toEqual(JSON.parse(text))
    }
  })

  it.each([
    ['duplicate key', '{"a":1,"a":2}', /Duplicate key "a" at line 1, column 8/],
    ['nested duplicate key', '{"x":{"b":1,"c":2,"b":3}}', /Duplicate key "b"/],
    ['escape-equivalent duplicate key', '{"a":1,"\\u0061":2}', /Duplicate key "a"/],
    ['duplicate __proto__ key', '{"__proto__":1,"__proto__":2}', /Duplicate key "__proto__"/],
    ['duplicate key across lines', '{\n  "routeId": "lipa",\n  "routeId": "bauan"\n}', /Duplicate key "routeId" at line 3, column 3/],
    ['trailing comma in object', '{"a":1,}', /Trailing comma in object/],
    ['trailing comma in array', '[1,2,]', /Trailing comma in array/],
    ['line comment', '{"a":1 // c\n}', /Expected "," or "}"/],
    ['block comment', '/* c */ {}', /Unexpected character/],
    ['single quotes', "{'a':1}", /Expected a string key/],
    ['unquoted key', '{a:1}', /Expected a string key/],
    ['NaN', '[NaN]', /Unexpected character/],
    ['Infinity', '[Infinity]', /Unexpected character/],
    ['leading zero', '[01]', /Invalid number/],
    ['plus sign', '[+1]', /Unexpected character/],
    ['bare minus', '[-]', /Invalid number/],
    ['dangling exponent', '[1e]', /Invalid number/],
    ['dangling fraction', '[1.]', /Invalid number/],
    ['raw tab in string', '"a\tb"', /Unescaped control character/],
    ['raw newline in string', '"a\nb"', /Unescaped control character/],
    ['invalid escape', '"\\x41"', /Invalid escape sequence/],
    ['short unicode escape', '"\\u12"', /Invalid \\u escape/],
    ['unterminated string', '"abc', /Unterminated string/],
    ['trailing content', '{} {}', /Unexpected trailing content/],
    ['trailing garbage after literal', '[truex]', /Expected "," or "]"/],
    ['empty input', '', /Unexpected end of input/],
    ['missing colon', '{"a" 1}', /Expected ":"/],
  ])('rejects %s', (_label, text, message) => {
    expect(() => parseStrictJson(text)).toThrow(message)
  })

  it('limits nesting depth instead of overflowing the stack', () => {
    expect(() => parseStrictJson('['.repeat(300) + ']'.repeat(300))).toThrow(/Nesting deeper than 256/)
    expect(parseStrictJson('['.repeat(200) + ']'.repeat(200))).toEqual(JSON.parse('['.repeat(200) + ']'.repeat(200)))
  })

  it('stores __proto__ and constructor as plain own keys; no prototype pollution', () => {
    const v = parseStrictJson('{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}') as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(v, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(v).toEqual(JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"x":1}}}'))
  })

  it('rejects non-string input', () => {
    expect(() => parseStrictJson(undefined as unknown as string)).toThrow(TypeError)
  })
})

// ── Shared geometry processing (gp-1) ───────────────────────────────────────

describe('processRoadPath (shared gp-1 processing)', () => {
  // Raw OSRM [lon, lat]: a collinear run, a sub-5 m wiggle, unrounded values, a rounding-induced duplicate
  // and a corner. Expected output captured from the generator's pre-refactor pipeline.
  const RAW = [[121.074283, 13.784193], [121.0735, 13.78395], [121.0727, 13.783705], [121.071912345, 13.78346],
    [121.071912349, 13.783460004], [121.0712, 13.78324], [121.0712, 13.7815], [121.07120002, 13.78], [121.0695, 13.7795]]
  const PINNED: LatLng[] = [[13.78419, 121.07428], [13.78324, 121.0712], [13.78, 121.0712], [13.7795, 121.0695]]

  it('produces the pinned gp-1 output exactly', () => {
    const out = processRoadPath(RAW)
    expect(out).toHaveLength(PINNED.length)
    out.forEach((p, i) => { expect(Object.is(p[0], PINNED[i][0])).toBe(true); expect(Object.is(p[1], PINNED[i][1])).toBe(true) })
  })

  it('equals the original inline pipeline (convert → simplify 5 m → round 5 dp → dedupe)', () => {
    const reference = dedupeConsecutive(simplify(RAW.map(osrmToLatLng), 5).map((p) => roundLatLng(p, 5)))
    expect(processRoadPath(RAW)).toEqual(reference)
  })

  it('pins the application-path hash of that output', () => {
    expect(routeGeometryHash(buildAppPath(CAMPUS, processRoadPath(RAW)), CAMPUS)).toBe('4baee0ee4dd4242aa7624ee5b11cecbe28d2d2ffa79362296a0b1e9121d9a5f5')
  })

  it('rejects fewer than two positions', () => {
    expect(() => processRoadPath([[121.07, 13.78]])).toThrow(TypeError)
  })
})

// ── Run extraction from diagnostic GeoJSON ──────────────────────────────────

describe('extractRunFromGeoJSON', () => {
  const H = 'a'.repeat(64)
  const feature = (kind: string, geometry: unknown, extra: Record<string, unknown> = {}) =>
    ({ type: 'Feature', geometry, properties: { corridorId: 'lipa', kind, ...extra } })
  const geo = () => ({
    type: 'FeatureCollection',
    biyahe: { runId: 'RUN-1', versions: { ...VERSIONS }, diagnosticSchemaVersion: 'ds-1' },
    features: [
      feature('route-raw', { type: 'LineString', coordinates: [[121.07428, 13.78419], [121.07, 13.81006]] },
        { validation: 'NEEDS REVIEW', warnings: [VALID_WARNINGS['campus-exit-unverified']], routeGeometrySha256: H }),
      feature('route-simplified', { type: 'LineString', coordinates: [[121.07428, 13.78419], [121.07, 13.81006]] }),
      feature('snapped-end', { type: 'Point', coordinates: [121.07, 13.81006] }),
    ],
  })

  it('extracts the run data local-mode validation needs, converting to [lat, lng]', () => {
    const { run, problems } = extractRunFromGeoJSON(geo(), 'f'.repeat(64), ['lipa'])
    expect(problems).toEqual([])
    expect(run).toMatchObject({ runId: 'RUN-1', geojsonSha256: 'f'.repeat(64), versions: VERSIONS })
    expect(run!.routes.lipa).toMatchObject({
      status: 'NEEDS REVIEW', routeGeometrySha256: H, snappedEnd: [13.81006, 121.07],
      simplifiedPath: [[13.78419, 121.07428], [13.81006, 121.07]], rawLonLat: [[121.07428, 13.78419], [121.07, 13.81006]],
    })
  })

  it.each([
    ['an older run without versions', (g: ReturnType<typeof geo>) => { delete (g.biyahe as Record<string, unknown>).versions }, /versions is missing/],
    ['no diagnostic schema version (pre-ds-1 file)', (g: ReturnType<typeof geo>) => { delete (g.biyahe as Record<string, unknown>).diagnosticSchemaVersion }, /diagnosticSchemaVersion is null, expected ds-1/],
    ['a different diagnostic schema version', (g: ReturnType<typeof geo>) => { (g.biyahe as Record<string, unknown>).diagnosticSchemaVersion = 'ds-0' }, /diagnosticSchemaVersion is "ds-0", expected ds-1/],
    ['no run ID', (g: ReturnType<typeof geo>) => { delete (g.biyahe as Record<string, unknown>).runId }, /runId is missing/],
    ['no structured warnings', (g: ReturnType<typeof geo>) => { delete (g.features[0].properties as Record<string, unknown>).warnings }, /no structured warnings/],
    ['no geometry hash', (g: ReturnType<typeof geo>) => { delete (g.features[0].properties as Record<string, unknown>).routeGeometrySha256 }, /no routeGeometrySha256/],
    ['no simplified path', (g: ReturnType<typeof geo>) => { g.features.splice(1, 1) }, /no route-simplified/],
    ['no snapped end', (g: ReturnType<typeof geo>) => { g.features.splice(2, 1) }, /no snapped-end/],
    ['duplicate route features', (g: ReturnType<typeof geo>) => { g.features.push(structuredClone(g.features[0])) }, /duplicate route features/],
  ])('returns no run and a problem for %s', (_label, edit, message) => {
    const g = geo()
    edit(g)
    const { run, problems } = extractRunFromGeoJSON(g, H, ['lipa'])
    expect(run).toBeNull()
    expect(problems.join('\n')).toMatch(message)
  })

  it('reports a missing corridor and rejects a non-FeatureCollection', () => {
    expect(extractRunFromGeoJSON(geo(), H, ['lipa', 'bauan']).problems.join('\n')).toMatch(/bauan: no route-raw feature/)
    expect(extractRunFromGeoJSON({ type: 'Feature' }, H, ['lipa']).problems).toEqual(['GeoJSON is not a FeatureCollection'])
  })
})

// ── Evidence reference classification ───────────────────────────────────────

describe('classifyEvidenceRef', () => {
  const committed = new Set(['docs/routes/approvals/evidence/photos.md'])

  it('HTTPS references are structural-only: well-formed, never fetched or verified', () => {
    expect(classifyEvidenceRef('https://example.org/biyahe/exit', committed)).toEqual({ kind: 'https', verification: 'structural-only' })
  })

  it('committed repository files are classified for blob verification by the caller', () => {
    expect(classifyEvidenceRef('docs/routes/approvals/evidence/photos.md', committed)).toEqual({ kind: 'repo', verification: 'committed-file' })
  })

  it.each([
    'C:\\evidence\\photo.jpg', '/home/me/photo.jpg', '~/photo.jpg', 'file:///C:/photo.jpg', 'http://example.org/x',
    'docs/../photo.jpg', 'docs/routes/approvals/evidence/not-committed.md',
  ])('classifies %j as invalid, with the same problem checkEvidenceRef reports', (ref) => {
    const c = classifyEvidenceRef(ref, committed)
    expect(c.kind).toBe('invalid')
    expect(checkEvidenceRef(ref, committed)).toBe((c as { problem: string }).problem)
  })
})

describe('repository evidence paths are limited to the pinned prefixes (as-1)', () => {
  const all = new Set(['src/lib/geo.js', 'README.md', 'docs/other/x.md', 'docs/routesX/x.md', 'docs/routes/alangilan-review-notes.md', 'docs/routes/approvals/evidence/photos.md'])
  it.each(['src/lib/geo.js', 'README.md', 'docs/other/x.md', 'docs/routesX/x.md'])('rejects committed file %j outside the allowed prefixes', (ref) => {
    const c = classifyEvidenceRef(ref, all)
    expect(c.kind).toBe('invalid')
    expect((c as { problem: string }).problem).toMatch(/outside the allowed evidence paths \(docs\/routes\/approvals\/evidence\/, docs\/routes\/\)/)
  })
  it.each(['docs/routes/alangilan-review-notes.md', 'docs/routes/approvals/evidence/photos.md'])('accepts committed file %j under an allowed prefix', (ref) => {
    expect(classifyEvidenceRef(ref, all)).toEqual({ kind: 'repo', verification: 'committed-file' })
  })
})

describe('unknown nested fields are rejected (as-1 field sets)', () => {
  it('resolution', () => {
    const rec = makeRecord('bauan') as unknown as { resolutions: Record<string, unknown>[] }
    rec.resolutions[0].approvedBy = 'x'
    expect(problemsOf(rec, recordCtx('bauan'))).toMatch(/record bauan resolution\[0\]: unknown field approvedBy/)
  })
  it('conditionsAcknowledged', () => {
    const rec = makeRecord('bauan')
    const res = rec.resolutions.find((r) => r.warningCode === 'campus-exit-unverified')!
    ;(res.conditionsAcknowledged as Record<string, unknown>).extra = 'x'
    expect(problemsOf(rec, recordCtx('bauan'))).toMatch(/conditionsAcknowledged has unknown field extra/)
  })
  it('endpointRelationship', () => {
    const id = Object.keys(RUN_WARNINGS).find((k) => RUN_WARNINGS[k].some((w) => w.code === 'endpoint-snap'))!
    const rec = makeRecord(id)
    const res = rec.resolutions.find((r) => r.endpointRelationship)!
    ;(res.endpointRelationship as Record<string, unknown>).verified = true
    expect(problemsOf(rec, recordCtx(id))).toMatch(/endpointRelationship has unknown field verified/)
  })
  it('history entry', () => {
    const rec = makeRecord('bauan')
    rec.history = [{ runId: 'OLDER-RUN', warning: { code: 'near-straight', text: 'near straight', value: 0.99 }, outcome: 'corrected',
      configChange: 'Added a via point.', resolution: 'Corrected.', reviewer: 'Project team (role)', reviewedOn: '2026-12-01', note: 'x' } as ApprovalRecord['history'][number]]
    expect(problemsOf(rec, recordCtx('bauan'))).toMatch(/history\[0\]: unknown field note/)
  })
  it('shared evidence (top level and findings)', () => {
    const ev = { ...makeEvidence(), signedBy: 'x', usability: { ...makeEvidence().usability, photos: 3 } }
    const p = validateSharedEvidence(ev, { committedFiles: COMMITTED }).problems.join('\n')
    expect(p).toMatch(/evidence: unknown field signedBy/)
    expect(p).toMatch(/evidence: usability has unknown field photos/)
  })
})

describe('shared evidence is validated even when no route relies on it', () => {
  it('an invalid evidence reference fails the set although no record has campus-exit-unverified', () => {
    const recs = CORRIDORS.map((c) => {
      const r = makeRecord(c.id)
      r.warnings = r.warnings.filter((w) => w.code !== 'campus-exit-unverified')
      r.resolutions = r.resolutions.filter((x) => x.warningCode !== 'campus-exit-unverified')
      return r
    })
    const run = makeRun()
    for (const r of Object.values(run.routes)) r.warnings = r.warnings.filter((w) => w.code !== 'campus-exit-unverified')
    const valid = validateApprovalSet({ records: recs, evidence: makeEvidence(), corridors: CORRIDORS, committedFiles: COMMITTED, mode: 'local', run })
    expect(valid.problems).toEqual([])
    const bad = { ...makeEvidence(), evidenceRefs: ['C:\\photos\\gate.jpg'] }
    const res = validateApprovalSet({ records: recs, evidence: bad, corridors: CORRIDORS, committedFiles: COMMITTED, mode: 'local', run })
    expect(res.valid).toBe(false)
    expect(res.problems.join('\n')).toMatch(/evidence: local machine path is not reviewer-accessible/)
  })
})

describe('resolution evidenceRef is validated', () => {
  it.each([
    ['a local absolute path', 'C:\\Users\\me\\notes.md', /evidenceRef: local machine path/],
    ['plain http', 'http://example.org/notes', /evidenceRef: only https:\/\/ URLs/],
    ['an uncommitted repository file', 'docs/routes/uncommitted-notes.md', /evidenceRef: docs\/routes\/uncommitted-notes.md is not a committed repository file/],
  ])('rejects %s', (_label, ref, message) => {
    const rec = makeRecord('bauan')
    rec.resolutions[0].evidenceRef = ref
    expect(problemsOf(rec, recordCtx('bauan'))).toMatch(message)
  })

  it('accepts an https URL as a resolution reference (structural check only)', () => {
    const rec = makeRecord('bauan')
    rec.resolutions[0].evidenceRef = 'https://example.org/biyahe/bauan-review'
    expect(validateApprovalRecord(rec, recordCtx('bauan')).valid).toBe(true)
  })
})
