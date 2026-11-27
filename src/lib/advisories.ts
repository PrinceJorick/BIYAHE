// Advisory lifecycle and visibility rules, shared by the coordinator and student screens. Pure functions over
// the snapshot, so they can be tested without a DOM, a store or a backend.
//
// Lifecycle (campus advisories): draft → published → resolved, or draft → resolved (withdrawn). Nothing is
// deleted; a resolved advisory stays in the record. Advisories from PAGASA and the LGU are read-only here.
// What students see as current: published (or status absent), not resolved, and not past its end time.
import { corridorById, corridorStateFor, type Advisory, type Corridor, type CorridorStatus, type Severity, type Snapshot } from '../data'

export type AdvisoryPhase = 'draft' | 'active' | 'resolved' | 'expired'

/** Whether an advisory's area concerns a student: the whole campus, all corridors, or their own corridor. */
export const concernsStudent = (a: Advisory, corridorId: string | null) => a.scope === 'all' || a.scope === 'campus' || a.scope === corridorId

export const TITLE_MAX = 90
export const BODY_MAX = 280
/** End-time choices offered to coordinators, in hours; null = no end time. */
export const EXPIRY_HOURS = [null, 1, 3, 6, 12, 24] as const
/** How long ended advisories stay listed (as ended, never as current) for students. */
export const RECENTLY_ENDED_MS = 6 * 60 * 60_000
const HOUR = 60 * 60_000

export function phaseOf(a: Advisory, now: number): AdvisoryPhase {
  if (a.status === 'draft') return 'draft'
  if (a.status === 'resolved') return 'resolved'
  if (a.expiresAt != null && a.expiresAt <= now) return 'expired'
  return 'active'
}

export const isActive = (a: Advisory, now: number) => phaseOf(a, now) === 'active'
/** Last time anything about the advisory changed. */
export const lastChanged = (a: Advisory) => Math.max(a.issuedAt, a.updatedAt ?? 0, a.resolvedAt ?? 0)
/** When an ended advisory stopped being current, or null if it has not ended. */
export function endedAt(a: Advisory, now: number): number | null {
  const p = phaseOf(a, now)
  if (p === 'resolved') return a.resolvedAt ?? a.updatedAt ?? a.issuedAt
  if (p === 'expired') return a.expiresAt!
  return null
}
export const isCorridorScope = (scope: string) => scope !== 'campus' && scope !== 'all'
const newestFirst = (a: Advisory, b: Advisory) => lastChanged(b) - lastChanged(a)

/** Current advisories for a student: active and about the whole campus, all corridors, or their corridor. */
export const studentAdvisories = (list: readonly Advisory[], corridorId: string | null, now: number) =>
  list.filter((a) => isActive(a, now) && concernsStudent(a, corridorId)).sort(newestFirst)

/** Current advisories for other corridors (shown separately, for students whose plans change). */
export const otherCorridorAdvisories = (list: readonly Advisory[], corridorId: string | null, now: number) =>
  list.filter((a) => isActive(a, now) && !concernsStudent(a, corridorId)).sort(newestFirst)

/** Advisories that concerned the student and ended within the last few hours. Never shown as current. A withdrawn
 * draft was never shown, so it never appears here either. */
export const recentlyEnded = (list: readonly Advisory[], corridorId: string | null, now: number) =>
  list.filter((a) => {
    if (a.withdrawn) return false
    const end = endedAt(a, now)
    return end != null && now - end <= RECENTLY_ENDED_MS && concernsStudent(a, corridorId)
  }).sort((a, b) => endedAt(b, now)! - endedAt(a, now)!)

/** Coordinator list, grouped by phase, newest first. */
export function coordinatorGroups(list: readonly Advisory[], now: number) {
  const of = (p: AdvisoryPhase | AdvisoryPhase[]) => list.filter((a) => ([] as AdvisoryPhase[]).concat(p).includes(phaseOf(a, now))).sort(newestFirst)
  return { drafts: of('draft'), active: of('active'), ended: of(['resolved', 'expired']) }
}

export function scopeLabel(scope: string, corridors: readonly Corridor[]) {
  if (scope === 'campus') return 'Whole campus'
  if (scope === 'all') return 'All routes'
  const c = corridors.find((x) => x.id === scope)
  return c ? `${c.name} route (${c.via})` : `Unknown area (${scope})`
}

/** Campus advisories are managed here; PAGASA and LGU advisories belong to their issuers. */
export const isManaged = (a: Advisory) => a.source === 'Campus'

/** The form values to start a new draft from an existing advisory (Resolved → Reuse). */
export const reuseInput = (a: Advisory): AdvisoryInput => ({
  scope: a.scope, severity: a.severity, title: a.title, body: a.body, corridorStatus: a.corridorStatus ?? null, expiresInHours: null,
})

// ── Input and validation ────────────────────────────────────────────────────

export type AdvisoryInput = {
  scope: string
  severity: Severity
  title: string
  body: string
  /** Corridor-scoped only: status applied to the corridor when the advisory is published. */
  corridorStatus?: CorridorStatus | null
  /** Hours until the advisory ends; null = no end time; undefined = keep the current end time (edits). */
  expiresInHours?: number | null
}

export type InputErrors = Partial<Record<'scope' | 'severity' | 'title' | 'body' | 'corridorStatus' | 'expiresInHours', string>>

const SEVERITIES: Severity[] = ['info', 'warning', 'critical']
const STATUSES: CorridorStatus[] = ['open', 'slow', 'closed']

export function validateAdvisoryInput(input: AdvisoryInput, corridors: readonly Corridor[]): InputErrors {
  const e: InputErrors = {}
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) e.title = 'Add a headline so students know what changed.'
  else if (title.length > TITLE_MAX) e.title = `Keep the headline to ${TITLE_MAX} characters.`
  if (typeof input.body !== 'string') e.body = 'Details must be text.'
  else if (input.body.trim().length > BODY_MAX) e.body = `Keep the details to ${BODY_MAX} characters.`
  if (!SEVERITIES.includes(input.severity)) e.severity = 'Choose a severity.'
  const corridorScope = isCorridorScope(input.scope)
  if (corridorScope && !corridors.some((c) => c.id === input.scope)) e.scope = 'Choose who sees the advisory.'
  if (input.corridorStatus != null) {
    if (!corridorScope) e.corridorStatus = 'A route status can only be set for a single route.'
    else if (!STATUSES.includes(input.corridorStatus)) e.corridorStatus = 'Choose open, slow or closed.'
  }
  if (input.expiresInHours != null && !(Number.isFinite(input.expiresInHours) && input.expiresInHours > 0 && input.expiresInHours <= 72)) {
    e.expiresInHours = 'Choose an end time within the next 72 hours, or no end time.'
  }
  return e
}

// ── Transitions (pure: snapshot in, snapshot out) ───────────────────────────

export type ChangeResult =
  | { ok: true; snapshot: Snapshot; advisory: Advisory; corridorChanged: string | null }
  | { ok: false; error: string; errors?: InputErrors }

const fail = (error: string, errors?: InputErrors): ChangeResult => ({ ok: false, error, errors })
const firstError = (e: InputErrors) => Object.values(e)[0] ?? 'Check the form.'

// Applies a published corridor advisory's status to its corridor (the existing behaviour of publishing).
function withCorridorEffect(snapshot: Snapshot, a: Advisory): { snapshot: Snapshot; corridorChanged: string | null } {
  if (a.status === 'draft' || a.status === 'resolved' || !a.corridorStatus || !isCorridorScope(a.scope)) return { snapshot, corridorChanged: null }
  const state = corridorStateFor(corridorById(a.scope), a.corridorStatus, a.title, 'Campus DRRMO advisory')
  return { snapshot: { ...snapshot, corridors: { ...snapshot.corridors, [a.scope]: state } }, corridorChanged: a.scope }
}

const replace = (snapshot: Snapshot, a: Advisory, now: number): Snapshot =>
  ({ ...snapshot, advisories: snapshot.advisories.map((x) => (x.id === a.id ? a : x)), updatedAt: now })

function find(snapshot: Snapshot, id: string): Advisory | ChangeResult {
  const a = snapshot.advisories.find((x) => x.id === id)
  if (!a) return fail('That advisory no longer exists.')
  if (!isManaged(a)) return fail(`${a.issuer} advisories are managed by their issuer and cannot be changed here.`)
  return a
}

export function createAdvisory(snapshot: Snapshot, input: AdvisoryInput, opts: { id: string; now: number; issuer: string; publish: boolean; corridors: readonly Corridor[] }): ChangeResult {
  const errors = validateAdvisoryInput(input, opts.corridors)
  if (Object.keys(errors).length) return fail(firstError(errors), errors)
  if (snapshot.advisories.some((a) => a.id === opts.id)) return fail('An advisory with this ID already exists.')
  const a: Advisory = {
    id: opts.id, source: 'Campus', issuer: opts.issuer, title: input.title.trim(), body: input.body.trim(),
    severity: input.severity, scope: input.scope, issuedAt: opts.now, status: opts.publish ? 'published' : 'draft', updatedAt: opts.now,
    ...(input.expiresInHours != null ? { expiresAt: opts.now + input.expiresInHours * HOUR } : {}),
    ...(input.corridorStatus && isCorridorScope(input.scope) ? { corridorStatus: input.corridorStatus } : {}),
  }
  const base = { ...snapshot, advisories: [a, ...snapshot.advisories], updatedAt: opts.now }
  const eff = withCorridorEffect(base, a)
  return { ok: true, snapshot: eff.snapshot, advisory: a, corridorChanged: eff.corridorChanged }
}

export function updateAdvisory(snapshot: Snapshot, id: string, input: AdvisoryInput, opts: { now: number; corridors: readonly Corridor[] }): ChangeResult {
  const found = find(snapshot, id)
  if ('ok' in found) return found
  const phase = phaseOf(found, opts.now)
  if (phase === 'resolved' || phase === 'expired') return fail('This advisory has ended and can no longer be edited. Publish a new one instead.')
  const errors = validateAdvisoryInput(input, opts.corridors)
  if (Object.keys(errors).length) return fail(firstError(errors), errors)
  const { expiresAt: oldEnd, corridorStatus: _old, ...rest } = found
  const a: Advisory = {
    ...rest, title: input.title.trim(), body: input.body.trim(), severity: input.severity, scope: input.scope, updatedAt: opts.now,
    ...(input.expiresInHours === undefined ? (oldEnd != null ? { expiresAt: oldEnd } : {}) : input.expiresInHours != null ? { expiresAt: opts.now + input.expiresInHours * HOUR } : {}),
    ...(input.corridorStatus && isCorridorScope(input.scope) ? { corridorStatus: input.corridorStatus } : {}),
  }
  const eff = withCorridorEffect(replace(snapshot, a, opts.now), a)
  return { ok: true, snapshot: eff.snapshot, advisory: a, corridorChanged: eff.corridorChanged }
}

export function publishAdvisory(snapshot: Snapshot, id: string, opts: { now: number }): ChangeResult {
  const found = find(snapshot, id)
  if ('ok' in found) return found
  if (found.status !== 'draft') return fail('Only drafts can be published.')
  if (found.expiresAt != null && found.expiresAt <= opts.now) return fail('This draft\'s end time has passed. Edit the end time before publishing.')
  const a: Advisory = { ...found, status: 'published', issuedAt: opts.now, updatedAt: opts.now }
  const eff = withCorridorEffect(replace(snapshot, a, opts.now), a)
  return { ok: true, snapshot: eff.snapshot, advisory: a, corridorChanged: eff.corridorChanged }
}

/** Resolves a published advisory, or withdraws a draft. Optionally marks its corridor open again. */
export function resolveAdvisory(snapshot: Snapshot, id: string, opts: { now: number; reopenCorridor?: boolean }): ChangeResult {
  const found = find(snapshot, id)
  if ('ok' in found) return found
  if (found.status === 'resolved') return fail('This advisory is already resolved.')
  const a: Advisory = { ...found, status: 'resolved', resolvedAt: opts.now, updatedAt: opts.now, ...(found.status === 'draft' ? { withdrawn: true } : {}) }
  let next = replace(snapshot, a, opts.now)
  let corridorChanged: string | null = null
  if (opts.reopenCorridor && isCorridorScope(a.scope) && next.corridors[a.scope]) {
    next = { ...next, corridors: { ...next.corridors, [a.scope]: corridorStateFor(corridorById(a.scope), 'open') } }
    corridorChanged = a.scope
  }
  return { ok: true, snapshot: next, advisory: a, corridorChanged }
}
