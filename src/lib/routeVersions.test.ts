// Version pins for the road-routing pipeline. Each pinned parameter set belongs to one version string.
// If parameters change without a version bump, the pin for the current version no longer matches and
// these tests fail. Pins are append-only: when a version is bumped, add a NEW pin for it and keep the
// old ones unchanged.
import { describe, expect, expectTypeOf, it } from 'vitest'
import * as gen from '../../scripts/build-routes.mjs'
import type {
  AcceptedPublicAccessStatus, AcceptedUsabilityStatus, ApprovalOutcome, EndpointWarningCode, EvidenceType,
  RejectedPublicAccessStatus, RejectedUsabilityStatus, WarningCode,
} from './routeVersions'
import { roundLatLng } from './geo'
import { buildBearingsParam, CAMPUS, CORRIDORS, classifyOvershoot, classifySnappedEndLoop, ENDPOINT_ZONE_M, NEAR_STRAIGHT_MIN_M, NEAR_STRAIGHT_RATIO } from './routeChecks'
import {
  APPROVAL_SCHEMA_PARAMS, APPROVAL_SCHEMA_VERSION, deriveRoutingPolicyParams, DIAG_SCHEMA_VERSION, GENERATOR_VERSION, GEOMETRY_PROCESSING_PARAMS,
  GEOMETRY_PROCESSING_VERSION, incompatibleVersionKeys, INVALIDATING_VERSION_KEYS, OSRM_REQUEST_POLICY, ROUTING_POLICY_VERSION,
  VERSIONS, WARNING_SCHEMA_PARAMS, WARNING_SCHEMA_VERSION,
} from './routeVersions'

// ── Pins (append-only) ──────────────────────────────────────────────────────

const ROUTING_POLICY_PINS: Record<string, unknown> = {
  'rp-1': {
    request: {
      server: 'osrm-public-demo-server',
      service: 'route',
      apiVersion: 'v1',
      profile: 'driving',
      coordinateOrderInRequest: 'lon,lat',
      query: { overview: 'full', geometries: 'geojson', steps: 'true' },
      alternatives: 'osrm-default (none requested)',
      routeSelection: 'first route (routes[0])',
      snapping: {
        radiuses: 'osrm-default (not sent)',
        approaches: 'osrm-default (not sent)',
        bearings: 'destination coordinate only, from the corridor approach constraint; omitted when none',
      },
    },
    campus: [13.7842, 121.0744],
    corridors: [
      { id: 'lipa', requestedEnd: [13.81, 121.07], vias: [], destinationBearing: null },
      { id: 'batangas', requestedEnd: [13.7575, 121.058], vias: [], destinationBearing: null },
      { id: 'bauan', requestedEnd: [13.79, 121.02], vias: [], destinationBearing: null },
      { id: 'sanjose', requestedEnd: [13.82, 121.115], vias: [], destinationBearing: { coordinate: 'end', bearingDeg: 30, rangeDeg: 45 } },
      { id: 'tanauan', requestedEnd: [13.85, 121.095], vias: [], destinationBearing: null },
    ],
  },
}

// Server identifier → URL, per routing-policy version. Kept here (a test file) rather than in
// routeVersions.js, because that module is app-importable and must not contain the OSRM host.
const ROUTING_POLICY_SERVER_URL_PINS: Record<string, Record<string, string>> = {
  'rp-1': { 'osrm-public-demo-server': 'https://router.project-osrm.org' },
}

const GEOMETRY_PROCESSING_PINS: Record<string, unknown> = {
  'gp-1': {
    input: 'OSRM route geometry, GeoJSON LineString positions [lon, lat]',
    conversion: 'swap to [lat, lng] per position; extra elements ignored; non-numeric positions rejected',
    steps: ['convert-to-lat-lng', 'simplify', 'round', 'remove-consecutive-duplicates', 'prepend-campus-point'],
    simplification: { algorithm: 'douglas-peucker', projection: 'local-equirectangular', toleranceM: 5, keepEndpoints: true },
    precision: { decimals: 5, rounding: 'Math.round(value * 10^5) / 10^5, latitude and longitude independently' },
    duplicates: 'remove consecutive points equal in both latitude and longitude after rounding',
    campusPoint: {
      roadPath: 'excludes the campus point',
      applicationPath: 'campus LOCATION prepended as the first point; never stored twice',
    },
    serialization: {
      appliesTo: 'complete application path [campus, ...roadPath]',
      prefix: '<geometryProcessingVersion>|latlng|5|',
      coordinateOrder: 'lat,lng',
      numberFormat: 'Number.prototype.toFixed(5); negative zero written as 0.00000; non-finite values rejected',
      pairSeparator: ',',
      pointSeparator: ';',
      trailingSeparator: false,
      whitespace: false,
      encoding: 'utf-8',
      hash: 'sha-256, lowercase hex',
    },
  },
}

const WARNING_SCHEMA_PINS: Record<string, unknown> = {
  'ws-1': {
    codes: [
      'campus-exit-unverified', 'destination-overshoot', 'endpoint-zone-not-reached', 'endpoint-snap', 'start-snap',
      'snap-bearing-applied', 'snapped-endpoint-loop', 'connector-long', 'near-straight', 'weak-road-evidence',
    ],
    warningShape: '{ code, text, value }',
    comparisons: 'strictly greater than (or less than) the threshold; equal values do not trigger',
    thresholds: {
      endpointZoneM: 100, endpointSnapReviewM: 150, startSnapReviewM: 150, connectorReviewM: 300,
      destinationOvershootReviewM: 300, destinationOvershootFailM: 1000, snappedEndpointLoopReviewM: 300,
      nearStraightMinStraightM: 500, nearStraightMaxRatio: 1.02, weakRoadShareBelow: 0.5, maxSegmentGuardM: 3000,
      lengthToleranceRatio: 0.02, finalApproachM: 150,
    },
  },
}

const APPROVAL_SCHEMA_PINS: Record<string, unknown> = {
  'as-1': {
    outcomes: ['accepted-limitation', 'unresolved', 'corrected'],
    correctedOnlyIn: 'history (warnings from an earlier run removed by a source-config change)',
    evidenceTypes: ['on-site-inspection', 'map-review', 'team-decision'],
    evidenceResolution: {
      'campus-exit-unverified': ['on-site-inspection'],
      'destination-overshoot': ['map-review', 'team-decision'],
      'endpoint-zone-not-reached': ['map-review', 'on-site-inspection'],
      'endpoint-snap': ['map-review', 'on-site-inspection'],
      'start-snap': ['map-review', 'team-decision'],
      'snap-bearing-applied': ['map-review'],
      'snapped-endpoint-loop': ['map-review', 'team-decision'],
      'connector-long': ['on-site-inspection', 'map-review'],
      'near-straight': ['map-review'],
      'weak-road-evidence': ['map-review', 'team-decision'],
    },
    campusExit: {
      warningCode: 'campus-exit-unverified',
      evidenceType: 'on-site-inspection',
      viaSharedEvidenceOnly: true,
      publicAccessStatuses: ['public', 'public-with-conditions', 'restricted', 'private', 'blocked', 'unknown'],
      publicAccessAccepted: ['public', 'public-with-conditions'],
      usabilityStatuses: ['usable', 'usable-with-conditions', 'unusable', 'unknown'],
      usabilityAccepted: ['usable', 'usable-with-conditions'],
      conditionsRequiredFor: {
        publicAccess: ['public-with-conditions'],
        usability: ['usable-with-conditions'],
      },
    },
    endpointWarnings: {
      codes: ['endpoint-snap', 'endpoint-zone-not-reached'],
      disallowedEvidenceTypes: ['team-decision'],
      requiresEndpointRelationship: true,
    },
    recordHash: 'sha-256 of utf-8 bytes after CRLF to LF normalization; byte-order mark rejected',
    requiredRouteCount: 5,
    evidenceRefPrefixes: ['docs/routes/approvals/evidence/', 'docs/routes/'],
    fields: {
      record: [
        'approvalSchemaVersion', 'routingPolicyVersion', 'geometryProcessingVersion', 'warningSchemaVersion', 'generatorVersion',
        'campus', 'routeId', 'runId', 'geojsonSha256', 'routeGeometrySha256', 'pathEnds', 'reviewedBy', 'reviewedOn',
        'warnings', 'resolutions', 'history',
      ],
      resolution: {
        required: ['warningCode', 'outcome', 'resolution', 'reviewer', 'reviewedOn', 'evidenceType', 'evidenceRef', 'runId', 'routeGeometrySha256'],
        optional: ['sharedEvidenceId', 'conditionsAcknowledged', 'endpointRelationship'],
      },
      endpointRelationship: ['requestedEndpoint', 'acceptedEndpoint', 'separationM', 'intendedDestination', 'relationship'],
      conditionsAcknowledged: ['publicAccess', 'usability'],
      history: ['runId', 'warning', 'outcome', 'configChange', 'resolution', 'reviewer', 'reviewedOn'],
      evidence: [
        'approvalSchemaVersion', 'evidenceId', 'evidenceType', 'subject', 'segmentsInspected', 'inspectedOn', 'inspectedBy',
        'publicAccess', 'usability', 'evidenceRefs', 'appliesToRoutes', 'limitations',
      ],
      evidenceFinding: { required: ['status', 'finding'], optional: ['conditions'] },
    },
  },
}

const pinFor = (pins: Record<string, unknown>, version: string) => {
  // A bumped version without a pin fails here, with a clear message.
  expect(pins[version], `no pin recorded for version ${version}; add one (pins are append-only)`).toBeDefined()
  return pins[version]
}

// ── Version values ──────────────────────────────────────────────────────────

describe('version constants', () => {
  it('has the five expected versions', () => {
    expect(VERSIONS).toEqual({
      routingPolicyVersion: 'rp-1', geometryProcessingVersion: 'gp-1', warningSchemaVersion: 'ws-1',
      approvalSchemaVersion: 'as-1', generatorVersion: '2.1.0',
    })
  })

  it('pins the diagnostic schema version ds-1, kept outside the record versions', () => {
    expect(DIAG_SCHEMA_VERSION).toBe('ds-1')
    expect(Object.values(VERSIONS)).not.toContain(DIAG_SCHEMA_VERSION)
    const geo = gen.buildDiagnosticGeoJSON([], { runId: 'R', generatedAt: 'n/a', osrmDataVersion: null })
    expect(geo.biyahe.diagnosticSchemaVersion).toBe('ds-1')
  })

  it('lists exactly four invalidating versions; the generator version is informational', () => {
    expect(INVALIDATING_VERSION_KEYS).toEqual(['routingPolicyVersion', 'geometryProcessingVersion', 'warningSchemaVersion', 'approvalSchemaVersion'])
    expect(INVALIDATING_VERSION_KEYS).not.toContain('generatorVersion')
    expect(GENERATOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('incompatibleVersionKeys ignores the generator version and reports every other difference', () => {
    expect(incompatibleVersionKeys(VERSIONS, { ...VERSIONS, generatorVersion: '9.9.9' })).toEqual([])
    expect(incompatibleVersionKeys(VERSIONS, { ...VERSIONS, routingPolicyVersion: 'rp-2' })).toEqual(['routingPolicyVersion'])
    expect(incompatibleVersionKeys(VERSIONS, { ...VERSIONS, geometryProcessingVersion: 'gp-2', approvalSchemaVersion: 'as-2' }))
      .toEqual(['geometryProcessingVersion', 'approvalSchemaVersion'])
    const { warningSchemaVersion: _missing, ...withoutWarning } = VERSIONS
    expect(incompatibleVersionKeys(VERSIONS, withoutWarning)).toEqual(['warningSchemaVersion'])
    expect(incompatibleVersionKeys(null, VERSIONS)).toEqual([...INVALIDATING_VERSION_KEYS])
  })

  it('parameter objects are frozen (no runtime edits)', () => {
    expect(Object.isFrozen(OSRM_REQUEST_POLICY)).toBe(true)
    expect(Object.isFrozen(OSRM_REQUEST_POLICY.query)).toBe(true)
    expect(Object.isFrozen(GEOMETRY_PROCESSING_PARAMS.simplification)).toBe(true)
    expect(Object.isFrozen(WARNING_SCHEMA_PARAMS.thresholds)).toBe(true)
    expect(() => { (WARNING_SCHEMA_PARAMS.thresholds as Record<string, number>).endpointZoneM = 50 }).toThrow(TypeError)
  })
})

// ── Routing policy pin ──────────────────────────────────────────────────────

describe(`routing policy pin (${ROUTING_POLICY_VERSION})`, () => {
  it('parameters derived from the live corridor configuration match the pin for the current version', () => {
    expect(deriveRoutingPolicyParams(CAMPUS, CORRIDORS)).toEqual(pinFor(ROUTING_POLICY_PINS, ROUTING_POLICY_VERSION))
  })

  // Demonstrates the detection: each edit below is the kind of config change that must bump the version.
  const derivedWith = (edit: (c: typeof CORRIDORS) => void, campus = CAMPUS) => {
    const copy = structuredClone(CORRIDORS)
    edit(copy)
    return deriveRoutingPolicyParams(campus, copy)
  }
  const pin = ROUTING_POLICY_PINS[ROUTING_POLICY_VERSION]

  it.each([
    ['a requested endpoint moves', (c: typeof CORRIDORS) => { c[0].end = [13.8101, 121.07] }],
    ['a bearing changes', (c: typeof CORRIDORS) => { c[3].approach!.bearingDeg = 31 }],
    ['a bearing range changes', (c: typeof CORRIDORS) => { c[3].approach!.rangeDeg = 60 }],
    ['a bearing is added', (c: typeof CORRIDORS) => { c[1].approach = { ...c[3].approach! } }],
    ['a bearing is removed', (c: typeof CORRIDORS) => { delete c[3].approach }],
    ['a via-point is added', (c: typeof CORRIDORS) => {
      c[2].vias.push({ lat: 13.785, lon: 121.05, osmWayId: null, osmRoadName: null, source: 's', reason: 'r', addedBy: 'a', addedOn: '2026-11-17' })
    }],
    ['corridors are reordered', (c: typeof CORRIDORS) => { c.reverse() }],
    ['a corridor is removed', (c: typeof CORRIDORS) => { c.pop() }],
  ])('detects an unversioned change when %s', (_label, edit) => {
    expect(derivedWith(edit)).not.toEqual(pin)
  })

  it('detects an unversioned change of the campus point', () => {
    expect(deriveRoutingPolicyParams([13.7843, 121.0744], CORRIDORS)).not.toEqual(pin)
  })

  it('ignores fields that do not affect routing (labels, road groups, provenance text)', () => {
    const relabelled = derivedWith((c) => {
      c[0].appViaLabel = 'Something else'
      c[0].primaryRoads = []
      c[3].approach!.reason = 'reworded provenance'
    })
    expect(relabelled).toEqual(pin)
  })

  // The generator's actual request construction, imported directly from scripts/build-routes.mjs.
  // Each test fails if the generator's routing behaviour changes without a ROUTING_POLICY_VERSION bump.
  describe('generator request construction (direct import)', () => {
    const sj = CORRIDORS.find((c) => c.id === 'sanjose')!
    const unconstrained = CORRIDORS.filter((c) => !c.approach)

    it('maps the policy server identifier to the pinned URL, and nothing else', () => {
      const urls = ROUTING_POLICY_SERVER_URL_PINS[ROUTING_POLICY_VERSION]
      expect(urls, `no server URL pin for ${ROUTING_POLICY_VERSION}; add one (pins are append-only)`).toBeDefined()
      expect(gen.OSRM_SERVER_URLS).toEqual(urls)
      expect(gen.osrmBaseUrl()).toBe(urls[OSRM_REQUEST_POLICY.server])
      expect(() => gen.osrmBaseUrl({ ...OSRM_REQUEST_POLICY, server: 'unknown-server' })).toThrow(/No URL configured/)
    })

    it('runs with the routing policy derived from the live config, which matches the pin', () => {
      expect(gen.routingPolicyParams()).toEqual(pinFor(ROUTING_POLICY_PINS, ROUTING_POLICY_VERSION))
    })

    it('builds exactly the pinned request URL for every corridor (no unpinned parameters)', () => {
      // Literal URLs: any change of server, service, API version, profile, coordinate order, query or
      // bearings, and any added parameter (alternatives, radiuses, approaches, …) fails here.
      const base = ROUTING_POLICY_SERVER_URL_PINS[ROUTING_POLICY_VERSION]['osrm-public-demo-server']
      const q = 'overview=full&geometries=geojson&steps=true'
      expect(Object.fromEntries(CORRIDORS.map((c) => [c.id, gen.buildRequestUrl(c).url]))).toEqual({
        lipa: `${base}/route/v1/driving/121.0744,13.7842;121.07,13.81?${q}`,
        batangas: `${base}/route/v1/driving/121.0744,13.7842;121.058,13.7575?${q}`,
        bauan: `${base}/route/v1/driving/121.0744,13.7842;121.02,13.79?${q}`,
        sanjose: `${base}/route/v1/driving/121.0744,13.7842;121.115,13.82?${q}&bearings=;30,45`,
        tanauan: `${base}/route/v1/driving/121.0744,13.7842;121.095,13.85?${q}`,
      })
      for (const c of CORRIDORS) {
        const keys = [...new URL(gen.buildRequestUrl(c).url).searchParams.keys()]
        expect(keys, c.id).toEqual(c.approach ? ['overview', 'geometries', 'steps', 'bearings'] : ['overview', 'geometries', 'steps'])
      }
    })

    it('requests campus, via-points, then the destination, sent as lon,lat', () => {
      expect(OSRM_REQUEST_POLICY.coordinateOrderInRequest).toBe('lon,lat')
      expect(gen.coordinatesFor(sj)).toEqual([CAMPUS, sj.end])
      const withVia = { ...sj, vias: [{ lat: 13.8, lon: 121.1, osmWayId: null, osmRoadName: null, source: 's', reason: 'r', addedBy: 'a', addedOn: '2026-12-01' }] }
      expect(gen.coordinatesFor(withVia)).toEqual([CAMPUS, [13.8, 121.1], sj.end])
      expect(gen.buildRequestUrl(withVia).url).toContain('/121.0744,13.7842;121.1,13.8;121.115,13.82?')
    })

    it('passes the destination-only constraints and the coordinate count into the bearing builder', () => {
      const calls: [number, unknown][] = []
      const spy = (count: number, constraints: { index: number; bearingDeg: number; rangeDeg: number }[]) => {
        calls.push([count, constraints])
        return buildBearingsParam(count, constraints)
      }
      for (const c of CORRIDORS) gen.bearingsFor(c, spy)
      expect(calls).toEqual(CORRIDORS.map((c) => [
        2 + c.vias.length,
        c.approach ? [{ index: 1 + c.vias.length, bearingDeg: c.approach.bearingDeg, rangeDeg: c.approach.rangeDeg }] : [],
      ]))
    })

    it('produces one bearing entry per coordinate, constraining only the destination', () => {
      expect(gen.bearingsFor(sj)).toBe(';30,45')
      const withVia = { ...sj, vias: [{ lat: 13.8, lon: 121.1, osmWayId: null, osmRoadName: null, source: 's', reason: 'r', addedBy: 'a', addedOn: '2026-12-01' }] }
      expect(gen.bearingsFor(withVia)).toBe(';;30,45')
      expect(gen.bearingsFor(withVia)!.split(';')).toHaveLength(gen.coordinatesFor(withVia).length)
    })

    it('rejects a bearing parameter whose entry count does not match the coordinates', () => {
      expect(() => gen.bearingsFor(sj, () => ';;30,45')).toThrow(/3 entries for 2 coordinates/)
    })

    it('uses the bearing result in the URL, and omits bearings for unconstrained corridors', () => {
      const { url, bearings } = gen.buildRequestUrl(sj)
      expect(bearings).toBe(gen.bearingsFor(sj))
      expect(url.endsWith(`&bearings=${bearings}`)).toBe(true)
      for (const c of unconstrained) {
        expect(gen.bearingsFor(c), c.id).toBeNull()
        expect(gen.buildRequestUrl(c).bearings, c.id).toBeNull()
        expect(gen.buildRequestUrl(c).url, c.id).not.toContain('bearings')
      }
    })
  })
})

// ── Geometry processing pin ─────────────────────────────────────────────────

describe(`geometry processing pin (${GEOMETRY_PROCESSING_VERSION})`, () => {
  it('matches the pin for the current version', () => {
    expect(GEOMETRY_PROCESSING_PARAMS).toEqual(pinFor(GEOMETRY_PROCESSING_PINS, GEOMETRY_PROCESSING_VERSION))
  })

  it('pins simplification tolerance, precision, duplicate handling, campus-point handling and serialization', () => {
    expect(GEOMETRY_PROCESSING_PARAMS.simplification.toleranceM).toBe(5)
    expect(GEOMETRY_PROCESSING_PARAMS.precision.decimals).toBe(5)
    expect(GEOMETRY_PROCESSING_PARAMS).toHaveProperty('duplicates')
    expect(GEOMETRY_PROCESSING_PARAMS).toHaveProperty('campusPoint.applicationPath')
    expect(GEOMETRY_PROCESSING_PARAMS).toHaveProperty('serialization.prefix', '<geometryProcessingVersion>|latlng|5|')
  })

  it('agrees with the existing rounding helper (5 decimals by default)', () => {
    const d = GEOMETRY_PROCESSING_PARAMS.precision.decimals
    expect(roundLatLng([13.784212345, 121.074456789])).toEqual([Number((13.784212345).toFixed(d)), Number((121.074456789).toFixed(d))])
  })

  it('the generator processes geometry with exactly these parameters', () => {
    expect(gen.SIMPLIFY_TOLERANCE_M).toBe(GEOMETRY_PROCESSING_PARAMS.simplification.toleranceM)
    expect(gen.DECIMALS).toBe(GEOMETRY_PROCESSING_PARAMS.precision.decimals)
  })
})

// ── Warning schema pin ──────────────────────────────────────────────────────

describe(`warning schema pin (${WARNING_SCHEMA_VERSION})`, () => {
  it('matches the pin for the current version', () => {
    expect(WARNING_SCHEMA_PARAMS).toEqual(pinFor(WARNING_SCHEMA_PINS, WARNING_SCHEMA_VERSION))
  })

  it('has unique codes', () => {
    expect(new Set(WARNING_SCHEMA_PARAMS.codes).size).toBe(WARNING_SCHEMA_PARAMS.codes.length)
  })

  it('agrees with the thresholds already implemented in the route checks', () => {
    const t = WARNING_SCHEMA_PARAMS.thresholds
    expect(ENDPOINT_ZONE_M).toBe(t.endpointZoneM)
    expect(NEAR_STRAIGHT_MIN_M).toBe(t.nearStraightMinStraightM)
    expect(NEAR_STRAIGHT_RATIO).toBe(t.nearStraightMaxRatio)
    expect(classifyOvershoot(t.destinationOvershootReviewM)).toBe('none')
    expect(classifyOvershoot(t.destinationOvershootReviewM + 0.001)).toBe('review')
    expect(classifyOvershoot(t.destinationOvershootFailM)).toBe('review')
    expect(classifyOvershoot(t.destinationOvershootFailM + 0.001)).toBe('fail')
    expect(classifySnappedEndLoop(t.snappedEndpointLoopReviewM)).toBe('none')
    expect(classifySnappedEndLoop(t.snappedEndpointLoopReviewM + 0.001)).toBe('review')
  })

  it('the generator uses the shared thresholds object itself, not a copy', () => {
    expect(gen.THRESHOLDS).toBe(WARNING_SCHEMA_PARAMS.thresholds)
  })

  it('the generator stamps every run with the shared versions', () => {
    expect(gen.versionMetadata()).toEqual(VERSIONS)
  })
})

// ── Approval schema pin ─────────────────────────────────────────────────────

describe(`approval schema pin (${APPROVAL_SCHEMA_VERSION})`, () => {
  it('matches the pin for the current version', () => {
    expect(APPROVAL_SCHEMA_PARAMS).toEqual(pinFor(APPROVAL_SCHEMA_PINS, APPROVAL_SCHEMA_VERSION))
  })

  it('requires all five Alangilan routes', () => {
    expect(APPROVAL_SCHEMA_PARAMS.requiredRouteCount).toBe(CORRIDORS.length)
  })

  describe('evidence-resolution policy is internally consistent', () => {
    const p = APPROVAL_SCHEMA_PARAMS

    it('covers exactly the warning codes of the warning schema', () => {
      expect(Object.keys(p.evidenceResolution).sort()).toEqual([...WARNING_SCHEMA_PARAMS.codes].sort())
    })

    it('uses only known evidence types, each warning at least one', () => {
      for (const [code, types] of Object.entries(p.evidenceResolution)) {
        expect(types.length, code).toBeGreaterThan(0)
        for (const t of types) expect(p.evidenceTypes, code).toContain(t)
      }
    })

    it('campus exit: only its required evidence type, and its code is a warning-schema code', () => {
      expect(WARNING_SCHEMA_PARAMS.codes).toContain(p.campusExit.warningCode)
      expect(p.evidenceResolution[p.campusExit.warningCode]).toEqual([p.campusExit.evidenceType])
    })

    it('endpoint warnings: warning-schema codes that never allow the disallowed evidence types', () => {
      for (const code of p.endpointWarnings.codes) {
        expect(WARNING_SCHEMA_PARAMS.codes).toContain(code)
        for (const banned of p.endpointWarnings.disallowedEvidenceTypes) expect(p.evidenceResolution[code], code).not.toContain(banned)
      }
    })

    it('accepted statuses are known statuses; conditional statuses are accepted statuses', () => {
      const ce = p.campusExit
      for (const s of ce.publicAccessAccepted) expect(ce.publicAccessStatuses).toContain(s)
      for (const s of ce.usabilityAccepted) expect(ce.usabilityStatuses).toContain(s)
      for (const s of ce.conditionsRequiredFor.publicAccess) expect(ce.publicAccessAccepted).toContain(s)
      for (const s of ce.conditionsRequiredFor.usability) expect(ce.usabilityAccepted).toContain(s)
    })

    it('outcomes include corrected (history only) and the two current-warning outcomes', () => {
      expect([...p.outcomes].sort()).toEqual(['accepted-limitation', 'corrected', 'unresolved'])
    })
  })

  // Compile-time checks (enforced by `tsc -b` in npm run build): the declarations are precise types,
  // not `unknown` or `any`.
  it('declares precise policy types', () => {
    const p = APPROVAL_SCHEMA_PARAMS
    expectTypeOf(p.outcomes).toEqualTypeOf<readonly ApprovalOutcome[]>()
    expectTypeOf(p.evidenceTypes).toEqualTypeOf<readonly EvidenceType[]>()
    expectTypeOf(p.evidenceResolution['campus-exit-unverified']).toEqualTypeOf<readonly ['on-site-inspection']>()
    expectTypeOf(p.evidenceResolution['endpoint-snap']).toEqualTypeOf<readonly Exclude<EvidenceType, 'team-decision'>[]>()
    expectTypeOf(p.evidenceResolution['near-straight']).toEqualTypeOf<readonly EvidenceType[]>()
    expectTypeOf(p.endpointWarnings.codes).toEqualTypeOf<readonly EndpointWarningCode[]>()
    expectTypeOf(p.endpointWarnings.disallowedEvidenceTypes).toEqualTypeOf<readonly 'team-decision'[]>()
    expectTypeOf(p.campusExit.warningCode).toEqualTypeOf<'campus-exit-unverified'>()
    expectTypeOf(p.campusExit.evidenceType).toEqualTypeOf<'on-site-inspection'>()
    expectTypeOf(p.campusExit.publicAccessAccepted).toEqualTypeOf<readonly AcceptedPublicAccessStatus[]>()
    expectTypeOf(p.campusExit.usabilityAccepted).toEqualTypeOf<readonly AcceptedUsabilityStatus[]>()
    expectTypeOf(p.campusExit.conditionsRequiredFor.publicAccess).toEqualTypeOf<readonly 'public-with-conditions'[]>()
    expectTypeOf(p.campusExit.conditionsRequiredFor.usability).toEqualTypeOf<readonly 'usable-with-conditions'[]>()
    expectTypeOf<RejectedPublicAccessStatus>().toEqualTypeOf<'restricted' | 'private' | 'blocked' | 'unknown'>()
    expectTypeOf<RejectedUsabilityStatus>().toEqualTypeOf<'unusable' | 'unknown'>()
    expectTypeOf(p.requiredRouteCount).toEqualTypeOf<5>()
    expectTypeOf(WARNING_SCHEMA_PARAMS.codes).toEqualTypeOf<readonly WarningCode[]>()
    expectTypeOf(WARNING_SCHEMA_PARAMS.thresholds.endpointZoneM).toEqualTypeOf<number>()
  })
})
