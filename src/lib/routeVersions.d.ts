// Type declarations for ./routeVersions.js (plain JavaScript so the generator and approval script can
// run it with plain `node`). No imports, so it adds no dependency to anything that uses it.

export const ROUTING_POLICY_VERSION: 'rp-1'
export const GEOMETRY_PROCESSING_VERSION: 'gp-1'
export const WARNING_SCHEMA_VERSION: 'ws-1'
export const APPROVAL_SCHEMA_VERSION: 'as-1'
export const GENERATOR_VERSION: string
export const DIAG_SCHEMA_VERSION: 'ds-1'

export type VersionSet = {
  routingPolicyVersion: string
  geometryProcessingVersion: string
  warningSchemaVersion: string
  approvalSchemaVersion: string
  generatorVersion: string
}
export type InvalidatingVersionKey = Exclude<keyof VersionSet, 'generatorVersion'>

export const VERSIONS: Readonly<VersionSet>
export const INVALIDATING_VERSION_KEYS: readonly InvalidatingVersionKey[]
export function incompatibleVersionKeys(a: Partial<VersionSet> | null | undefined, b: Partial<VersionSet> | null | undefined): InvalidatingVersionKey[]

export type OsrmRequestPolicy = {
  readonly server: string
  readonly service: string
  readonly apiVersion: string
  readonly profile: string
  readonly coordinateOrderInRequest: string
  readonly query: Readonly<Record<string, string>>
  readonly alternatives: string
  readonly routeSelection: string
  readonly snapping: Readonly<{ radiuses: string; approaches: string; bearings: string }>
}
export const OSRM_REQUEST_POLICY: OsrmRequestPolicy

export type RoutingPolicyCorridorInput = {
  id: string
  end: readonly [number, number] | number[]
  vias?: readonly { lat: number; lon: number }[]
  approach?: { coordinate: string; bearingDeg: number; rangeDeg: number }
}
export type RoutingPolicyParams = {
  request: OsrmRequestPolicy
  campus: [number, number]
  corridors: {
    id: string
    requestedEnd: [number, number]
    vias: [number, number][]
    destinationBearing: { coordinate: string; bearingDeg: number; rangeDeg: number } | null
  }[]
}
export function deriveRoutingPolicyParams(campus: readonly number[], corridors: readonly RoutingPolicyCorridorInput[]): RoutingPolicyParams

export const GEOMETRY_PROCESSING_PARAMS: Readonly<Record<string, unknown>> & {
  readonly simplification: Readonly<{ algorithm: string; projection: string; toleranceM: number; keepEndpoints: boolean }>
  readonly precision: Readonly<{ decimals: number; rounding: string }>
}
// ── Warning schema (WARNING_SCHEMA_VERSION) ─────────────────────────────────

export type WarningCode =
  | 'campus-exit-unverified'
  | 'destination-overshoot'
  | 'endpoint-zone-not-reached'
  | 'endpoint-snap'
  | 'start-snap'
  | 'snap-bearing-applied'
  | 'snapped-endpoint-loop'
  | 'connector-long'
  | 'near-straight'
  | 'weak-road-evidence'

export type WarningThresholds = {
  readonly endpointZoneM: number
  readonly endpointSnapReviewM: number
  readonly startSnapReviewM: number
  readonly connectorReviewM: number
  readonly destinationOvershootReviewM: number
  readonly destinationOvershootFailM: number
  readonly snappedEndpointLoopReviewM: number
  readonly nearStraightMinStraightM: number
  readonly nearStraightMaxRatio: number
  readonly weakRoadShareBelow: number
  readonly maxSegmentGuardM: number
  readonly lengthToleranceRatio: number
  readonly finalApproachM: number
}

export const WARNING_SCHEMA_PARAMS: {
  readonly codes: readonly WarningCode[]
  readonly warningShape: string
  readonly comparisons: string
  readonly thresholds: WarningThresholds
}

// ── Approval schema (APPROVAL_SCHEMA_VERSION) ───────────────────────────────

export type ApprovalOutcome = 'accepted-limitation' | 'unresolved' | 'corrected'
export type EvidenceType = 'on-site-inspection' | 'map-review' | 'team-decision'

export type EndpointWarningCode = Extract<WarningCode, 'endpoint-snap' | 'endpoint-zone-not-reached'>
export type CampusExitWarningCode = Extract<WarningCode, 'campus-exit-unverified'>

export type PublicAccessStatus = 'public' | 'public-with-conditions' | 'restricted' | 'private' | 'blocked' | 'unknown'
export type AcceptedPublicAccessStatus = Extract<PublicAccessStatus, 'public' | 'public-with-conditions'>
export type RejectedPublicAccessStatus = Exclude<PublicAccessStatus, AcceptedPublicAccessStatus>
export type ConditionalPublicAccessStatus = Extract<PublicAccessStatus, 'public-with-conditions'>

export type UsabilityStatus = 'usable' | 'usable-with-conditions' | 'unusable' | 'unknown'
export type AcceptedUsabilityStatus = Extract<UsabilityStatus, 'usable' | 'usable-with-conditions'>
export type RejectedUsabilityStatus = Exclude<UsabilityStatus, AcceptedUsabilityStatus>
export type ConditionalUsabilityStatus = Extract<UsabilityStatus, 'usable-with-conditions'>

/**
 * Evidence types allowed to resolve each warning code: the campus exit only by on-site inspection;
 * endpoint warnings never by team decision; every other warning by any evidence type listed.
 */
export type EvidenceResolutionPolicy = {
  readonly [C in WarningCode]: C extends CampusExitWarningCode
    ? readonly ['on-site-inspection']
    : C extends EndpointWarningCode
      ? readonly Exclude<EvidenceType, 'team-decision'>[]
      : readonly EvidenceType[]
}

export type CampusExitPolicy = {
  readonly warningCode: CampusExitWarningCode
  readonly evidenceType: 'on-site-inspection'
  readonly viaSharedEvidenceOnly: true
  readonly publicAccessStatuses: readonly PublicAccessStatus[]
  readonly publicAccessAccepted: readonly AcceptedPublicAccessStatus[]
  readonly usabilityStatuses: readonly UsabilityStatus[]
  readonly usabilityAccepted: readonly AcceptedUsabilityStatus[]
  /** Statuses whose finding must include non-empty `conditions`. */
  readonly conditionsRequiredFor: {
    readonly publicAccess: readonly ConditionalPublicAccessStatus[]
    readonly usability: readonly ConditionalUsabilityStatus[]
  }
}

export type EndpointWarningPolicy = {
  readonly codes: readonly EndpointWarningCode[]
  readonly disallowedEvidenceTypes: readonly Extract<EvidenceType, 'team-decision'>[]
  readonly requiresEndpointRelationship: true
}

export const APPROVAL_SCHEMA_PARAMS: {
  readonly outcomes: readonly ApprovalOutcome[]
  readonly correctedOnlyIn: string
  readonly evidenceTypes: readonly EvidenceType[]
  readonly evidenceResolution: EvidenceResolutionPolicy
  readonly campusExit: CampusExitPolicy
  readonly endpointWarnings: EndpointWarningPolicy
  readonly recordHash: string
  readonly requiredRouteCount: 5
  readonly evidenceRefPrefixes: readonly ['docs/routes/approvals/evidence/', 'docs/routes/']
  readonly fields: ApprovalFieldSets
}

/** Exact field sets for approval records and shared evidence (unknown fields are rejected). */
export type ApprovalFieldSets = {
  readonly record: readonly string[]
  readonly resolution: { readonly required: readonly string[]; readonly optional: readonly ['sharedEvidenceId', 'conditionsAcknowledged', 'endpointRelationship'] }
  readonly endpointRelationship: readonly ['requestedEndpoint', 'acceptedEndpoint', 'separationM', 'intendedDestination', 'relationship']
  readonly conditionsAcknowledged: readonly ['publicAccess', 'usability']
  readonly history: readonly ['runId', 'warning', 'outcome', 'configChange', 'resolution', 'reviewer', 'reviewedOn']
  readonly evidence: readonly string[]
  readonly evidenceFinding: { readonly required: readonly ['status', 'finding']; readonly optional: readonly ['conditions'] }
}
