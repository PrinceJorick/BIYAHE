// UNVERIFIED PROTOTYPE PREVIEW of road-following corridor geometry. Browser-safe: imports only the shared
// hashing (routeHash.js) and version (routeVersions.js) modules.
//
// This is deliberately separate from the formal, fail-closed reviewed-geometry activation
// (src/lib/reviewedGeometry.ts), which it never calls with unapproved data and never replaces. Precedence:
//   1. formal reviewed geometry supplied and valid           → reviewed paths
//   2. formal geometry supplied but INVALID                  → hand-drawn paths (never masked by the preview)
//   3. no formal geometry, preview mode on, preview valid    → prototype preview paths (all five or none)
//   4. otherwise                                             → hand-drawn paths
// Preview mode is on only in the Vite dev server (mode 'development') or an explicit route-preview build
// (`vite build --mode route-preview`); an ordinary production build never activates it.
import type { Corridor, LatLng } from '../types'
import { activateReviewedGeometry, type Activation, type ActivationContext, type ReviewedRoadSet } from './reviewedGeometry'
import { routeGeometryHash, serializeAppPath } from './routeHash.js'
import { incompatibleVersionKeys, VERSIONS, type VersionSet } from './routeVersions.js'

export const PREVIEW_STATUS = 'unverified-prototype-preview'
/** Vite modes in which the prototype preview may be shown. */
export const PREVIEW_MODES = ['development', 'route-preview'] as const
export const isPreviewMode = (mode: string | undefined) => (PREVIEW_MODES as readonly string[]).includes(mode ?? '')

export type PreviewWarning = { code: string; value: number | null }
export type PreviewRoute = {
  routeId: string
  /** Complete application path: campus anchor first ([lat, lng], 5 decimals, processing gp-1). */
  path: LatLng[]
  routeGeometrySha256: string
  pathEnds: 'partial' | null
  /** Warning codes (and numeric values) from the diagnostic run, for the on-map limitations. */
  warnings: PreviewWarning[]
  /** Distance between the configured endpoint and the road endpoint, metres (0.1 m). */
  endpointSeparationM: number
  /** Road name at the road endpoint, as OSRM reported it ('(unnamed)' if none). */
  endRoad: string
}
export type PreviewRoadSet = {
  status: typeof PREVIEW_STATUS
  campus: string
  campusAnchor: LatLng
  runId: string
  sourceGeojsonSha256: string
  versions: VersionSet
  routes: PreviewRoute[]
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isHash = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
const SET_FIELDS = ['status', 'campus', 'campusAnchor', 'runId', 'sourceGeojsonSha256', 'versions', 'routes']
const ROUTE_FIELDS = ['routeId', 'path', 'routeGeometrySha256', 'pathEnds', 'warnings', 'endpointSeparationM', 'endRoad']

/** Problems with a preview set (empty = internally consistent). Exactly one entry per configured corridor. */
export function validatePreviewRoadSet(p: unknown, ctx: ActivationContext & { routeIds: readonly string[] }): string[] {
  const problems: string[] = []
  if (!isObject(p)) return ['preview data is not an object']
  for (const k of Object.keys(p)) if (!SET_FIELDS.includes(k)) problems.push(`unknown field ${k}`)
  if (p.status !== PREVIEW_STATUS) problems.push(`status must be ${PREVIEW_STATUS}`)
  if (p.campus !== ctx.campusId) problems.push(`campus must be ${ctx.campusId}`)
  const anchor = p.campusAnchor
  if (!(Array.isArray(anchor) && anchor[0] === ctx.anchor[0] && anchor[1] === ctx.anchor[1] && anchor.length === 2)) problems.push('campusAnchor must equal the campus location exactly')
  if (typeof p.runId !== 'string' || !/^[A-Za-z0-9-]+$/.test(p.runId)) problems.push('runId is missing or malformed')
  if (!isHash(p.sourceGeojsonSha256)) problems.push('sourceGeojsonSha256 must be a SHA-256 hex digest')
  if (!isObject(p.versions)) problems.push('versions are missing')
  else {
    const bad = incompatibleVersionKeys(p.versions as Partial<VersionSet>, VERSIONS)
    if (bad.length) problems.push(`incompatible versions: ${bad.join(', ')}`)
  }
  if (!Array.isArray(p.routes)) return [...problems, 'routes must be an array']
  if (p.routes.length !== ctx.routeIds.length) problems.push(`routes must contain exactly ${ctx.routeIds.length} entries (found ${p.routes.length})`)
  const seen = new Set<string>()
  p.routes.forEach((r: unknown, i) => {
    if (!isObject(r)) { problems.push(`routes[${i}]: not an object`); return }
    for (const k of Object.keys(r)) if (!ROUTE_FIELDS.includes(k)) problems.push(`routes[${i}]: unknown field ${k}`)
    const id = r.routeId
    if (typeof id !== 'string' || !ctx.routeIds.includes(id)) { problems.push(`routes[${i}]: unknown route ${JSON.stringify(id)}`); return }
    if (seen.has(id)) problems.push(`routes[${i}]: duplicate route ${id}`)
    seen.add(id)
    if (r.pathEnds !== null && r.pathEnds !== 'partial') problems.push(`${id}: pathEnds must be "partial" or null`)
    let pathOk = false
    try {
      if (!Array.isArray(r.path)) throw new TypeError('path must be an array')
      serializeAppPath(r.path as LatLng[], ctx.anchor)
      pathOk = true
    } catch (e) {
      problems.push(`${id}: invalid path: ${e instanceof Error ? e.message : String(e)}`)
    }
    if (!isHash(r.routeGeometrySha256)) problems.push(`${id}: routeGeometrySha256 must be a SHA-256 hex digest`)
    else if (pathOk && routeGeometryHash(r.path as LatLng[], ctx.anchor) !== r.routeGeometrySha256) problems.push(`${id}: routeGeometrySha256 does not match the path`)
    if (!Array.isArray(r.warnings) || !r.warnings.every((w) => isObject(w) && typeof w.code === 'string' && (w.value === null || (typeof w.value === 'number' && Number.isFinite(w.value))))) {
      problems.push(`${id}: warnings must be a list of { code, value }`)
    }
    if (typeof r.endpointSeparationM !== 'number' || !Number.isFinite(r.endpointSeparationM) || r.endpointSeparationM < 0) problems.push(`${id}: endpointSeparationM must be a non-negative number`)
    if (typeof r.endRoad !== 'string') problems.push(`${id}: endRoad must be a string`)
  })
  for (const id of ctx.routeIds) if (!seen.has(id)) problems.push(`route ${id} is missing`)
  return problems
}

/** All five preview paths, or the hand-drawn corridors unchanged (same array and objects). */
export function activatePreviewGeometry(handDrawn: Corridor[], preview: PreviewRoadSet | null | undefined, ctx: ActivationContext): Activation {
  if (preview == null) return { corridors: handDrawn, active: false, problems: [] }
  try {
    const routeIds = handDrawn.map((c) => c.id)
    const problems = validatePreviewRoadSet(preview, { ...ctx, routeIds })
    if (new Set(routeIds).size !== routeIds.length) problems.push('the hand-drawn corridors contain duplicate IDs')
    if (problems.length) return { corridors: handDrawn, active: false, problems }
    const byId = new Map(preview.routes.map((r) => [r.routeId, r]))
    return { corridors: handDrawn.map((c) => ({ ...c, path: byId.get(c.id)!.path.map((p): LatLng => [p[0], p[1]]) })), active: true, problems: [] }
  } catch (e) {
    return { corridors: handDrawn, active: false, problems: [`validation error: ${e instanceof Error ? e.message : String(e)}`] }
  }
}

export type RouteGeometrySource = 'reviewed' | 'preview' | 'hand-drawn'
export type GeometrySelection = {
  corridors: Corridor[]
  source: RouteGeometrySource
  /** Formal reviewed-geometry activation (unchanged Step 5 behaviour). */
  formal: Activation
  /** Preview activation; null when the preview was not considered. */
  preview: Activation | null
  /** The preview routes in use (for the on-map limitations); null unless source is 'preview'. */
  previewRoutes: PreviewRoute[] | null
}

export function selectCorridorGeometry(opts: {
  handDrawn: Corridor[]
  formal: ReviewedRoadSet | null
  preview: PreviewRoadSet | null
  previewEnabled: boolean
  ctx: ActivationContext
}): GeometrySelection {
  const formal = activateReviewedGeometry(opts.handDrawn, opts.formal, opts.ctx)
  if (opts.formal !== null) {
    // Formal data exists: it either activates, or the app falls back to hand-drawn. Never to the preview.
    return { corridors: formal.corridors, source: formal.active ? 'reviewed' : 'hand-drawn', formal, preview: null, previewRoutes: null }
  }
  if (!opts.previewEnabled || opts.preview === null) return { corridors: opts.handDrawn, source: 'hand-drawn', formal, preview: null, previewRoutes: null }
  const preview = activatePreviewGeometry(opts.handDrawn, opts.preview, opts.ctx)
  return {
    corridors: preview.corridors, source: preview.active ? 'preview' : 'hand-drawn', formal, preview,
    previewRoutes: preview.active ? opts.preview.routes : null,
  }
}

// ── On-map wording ───────────────────────────────────────────────────────────

export const PREVIEW_NOTICE = 'These routes follow roads in OpenStreetMap and have not been checked on site or formally approved. Use them as a guide to which roads your trip uses, not as turn-by-turn navigation or confirmation of public access.'
export const CAMPUS_EXIT_NOTE = 'Campus exit (unnamed road, Neptune Street, Mercury Street): public access and usability not yet checked on site.'

/** Route-specific limitations shown with the preview. Numbers come from the diagnostic run. */
export function previewRouteNotes(r: PreviewRoute, destination: string): string[] {
  const notes: string[] = []
  const warn = (code: string) => r.warnings.find((w) => w.code === code)
  if (r.pathEnds === 'partial') notes.push(`Partial route, not a complete trip to ${destination}.`)
  const over = warn('destination-overshoot')
  if (over && over.value != null) notes.push(`Candidate passes its destination and loops back: documented ${over.value} m destination overshoot.`)
  if (warn('endpoint-snap') || warn('endpoint-zone-not-reached')) {
    notes.push(`Candidate ends on ${r.routeId === 'sanjose' ? 'the STAR mainline' : r.endRoad}, ${r.endpointSeparationM} m from the configured destination. This is not an approved vehicle stopping or alighting point, and no pedestrian connection to the destination has been verified.`)
  }
  if (warn('campus-exit-unverified')) notes.push(CAMPUS_EXIT_NOTE)
  return notes
}
