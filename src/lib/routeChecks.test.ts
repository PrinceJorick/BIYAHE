// Route checks used by the developer-only generator. These run before every generator run
// (npm run routes:alangilan), so no OSRM request is made unless they pass. No network here.
import { describe, expect, it } from 'vitest'
import { alangilan } from '../campuses/alangilan'
import type { LatLng } from '../types'
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
      const app = alangilan.corridors.find((x) => x.id === c.id)
      expect(app, c.id).toBeDefined()
      expect(c.end).toEqual(app!.path[app!.path.length - 1])
      expect(c.appViaLabel).toBe(app!.via)
    }
    expect(CORRIDORS.map((c) => c.id)).toEqual(alangilan.corridors.map((c) => c.id))
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
