// Shared route versions for the road-routing pipeline: the diagnostic generator, the approval script,
// the route checks and the application's reviewed-geometry validator all read these constants.
// Plain ES module with no imports, so anything can depend on it without circular imports.
//
// Four versions INVALIDATE approval records when they differ between the code, a diagnostic run and a
// record: routing policy, geometry processing, warning schema and approval schema. GENERATOR_VERSION is
// informational only (implementation changes that do not alter routing, processing or warnings).
//
// Bump rules (enforced by the pin tests in routeVersions.test.ts):
//   ROUTING_POLICY_VERSION      — OSRM server, profile, request parameters, route selection, snapping
//                                 behaviour, the campus point, any requested endpoint, via-point or bearing.
//   GEOMETRY_PROCESSING_VERSION — coordinate conversion, simplification, precision, duplicate handling,
//                                 campus-point handling or path serialization.
//   WARNING_SCHEMA_VERSION      — any warning code, meaning, value shape or threshold.
//   APPROVAL_SCHEMA_VERSION     — the approval record, shared evidence or roads-data schema.
// Never edit an existing pinned version's parameters: bump the version and add a new pin.

export const ROUTING_POLICY_VERSION = 'rp-1'
export const GEOMETRY_PROCESSING_VERSION = 'gp-1'
export const WARNING_SCHEMA_VERSION = 'ws-1'
export const APPROVAL_SCHEMA_VERSION = 'as-1'
export const GENERATOR_VERSION = '2.1.0'
// Diagnostic GeoJSON format. ds-1 adds the exact raw OSRM fields needed to re-run the route analysis
// (step osrmDistanceM, waypoint osrmLocation / osrmName, route osrmDataVersion). The approval validator
// requires it; diagnostics without it cannot be approved. It is a property of the diagnostic file, not of
// approval records, so it is not part of VERSIONS.
export const DIAG_SCHEMA_VERSION = 'ds-1'

export const VERSIONS = /* @__PURE__ */ Object.freeze({
  routingPolicyVersion: ROUTING_POLICY_VERSION,
  geometryProcessingVersion: GEOMETRY_PROCESSING_VERSION,
  warningSchemaVersion: WARNING_SCHEMA_VERSION,
  approvalSchemaVersion: APPROVAL_SCHEMA_VERSION,
  generatorVersion: GENERATOR_VERSION,
})

// Version fields whose mismatch invalidates approval records. generatorVersion is deliberately absent.
export const INVALIDATING_VERSION_KEYS = /* @__PURE__ */ Object.freeze([
  'routingPolicyVersion', 'geometryProcessingVersion', 'warningSchemaVersion', 'approvalSchemaVersion',
])

// Names of the invalidating version fields that differ between two version sets (missing counts as
// different). generatorVersion differences are ignored.
export function incompatibleVersionKeys(a, b) {
  return INVALIDATING_VERSION_KEYS.filter((k) => a?.[k] == null || b?.[k] == null || a[k] !== b[k])
}

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

// ── Routing policy ──────────────────────────────────────────────────────────
// The OSRM request policy. The server is named by an identifier rather than its URL so this module stays
// importable by application code (the isolation test forbids the OSRM host in app modules); the generator
// maps the identifier to its URL.
export const OSRM_REQUEST_POLICY = /* @__PURE__ */ deepFreeze({
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
})

// Routing-policy parameters derived from the live corridor configuration (CAMPUS and CORRIDORS in
// src/lib/routeChecks.js) plus the request policy above. Pure: the caller passes the config in, which
// keeps this module free of imports. Corridor order is kept because requests are made in that order.
export function deriveRoutingPolicyParams(campus, corridors) {
  if (!Array.isArray(campus) || campus.length !== 2) throw new TypeError('campus must be [lat, lng]')
  if (!Array.isArray(corridors)) throw new TypeError('corridors must be an array')
  return {
    request: OSRM_REQUEST_POLICY,
    campus: [campus[0], campus[1]],
    corridors: corridors.map((c) => ({
      id: c.id,
      requestedEnd: [c.end[0], c.end[1]],
      vias: (c.vias ?? []).map((v) => [v.lat, v.lon]),
      destinationBearing: c.approach
        ? { coordinate: c.approach.coordinate, bearingDeg: c.approach.bearingDeg, rangeDeg: c.approach.rangeDeg }
        : null,
    })),
  }
}

// ── Geometry processing ─────────────────────────────────────────────────────
export const GEOMETRY_PROCESSING_PARAMS = /* @__PURE__ */ deepFreeze({
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
})

// ── Warning schema ──────────────────────────────────────────────────────────
export const WARNING_SCHEMA_PARAMS = /* @__PURE__ */ deepFreeze({
  codes: [
    'campus-exit-unverified',
    'destination-overshoot',
    'endpoint-zone-not-reached',
    'endpoint-snap',
    'start-snap',
    'snap-bearing-applied',
    'snapped-endpoint-loop',
    'connector-long',
    'near-straight',
    'weak-road-evidence',
  ],
  warningShape: '{ code, text, value }',
  comparisons: 'strictly greater than (or less than) the threshold; equal values do not trigger',
  thresholds: {
    endpointZoneM: 100,
    endpointSnapReviewM: 150,
    startSnapReviewM: 150,
    connectorReviewM: 300,
    destinationOvershootReviewM: 300,
    destinationOvershootFailM: 1000,
    snappedEndpointLoopReviewM: 300,
    nearStraightMinStraightM: 500,
    nearStraightMaxRatio: 1.02,
    weakRoadShareBelow: 0.5,
    maxSegmentGuardM: 3000,
    lengthToleranceRatio: 0.02,
    finalApproachM: 150,
  },
})

// ── Approval schema ─────────────────────────────────────────────────────────
// Which evidence may resolve which warning is approval policy, so it lives here (APPROVAL_SCHEMA_VERSION).
// The warning codes themselves, their value shapes and thresholds stay under WARNING_SCHEMA_VERSION.
export const APPROVAL_SCHEMA_PARAMS = /* @__PURE__ */ deepFreeze({
  outcomes: ['accepted-limitation', 'unresolved', 'corrected'],
  correctedOnlyIn: 'history (warnings from an earlier run removed by a source-config change)',
  evidenceTypes: ['on-site-inspection', 'map-review', 'team-decision'],
  // Evidence types allowed to resolve each warning code (keys = every WARNING_SCHEMA_PARAMS code).
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
    // Statuses whose finding must state its conditions (a non-empty `conditions` field).
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
  // Repository evidence references must be committed files under one of these prefixes.
  evidenceRefPrefixes: ['docs/routes/approvals/evidence/', 'docs/routes/'],
  // Exact field sets. Unknown fields are rejected at every level; optional fields may be absent.
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
})
