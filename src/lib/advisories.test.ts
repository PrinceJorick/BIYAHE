// Advisory lifecycle and visibility rules (src/lib/advisories.ts): pure, no store or backend.
import { describe, expect, it } from 'vitest'
import { corridors, fixture, type Advisory, type Snapshot } from '../data'
import {
  concernsStudent, coordinatorGroups, createAdvisory, isActive, otherCorridorAdvisories, phaseOf, publishAdvisory,
  recentlyEnded, resolveAdvisory, reuseInput, scopeLabel, studentAdvisories, updateAdvisory, validateAdvisoryInput, type AdvisoryInput,
} from './advisories'

const MIN = 60_000
const HOUR = 60 * MIN
const NOW = Date.UTC(2026, 10, 17, 7, 0)
const base = (): Snapshot => fixture('clear', NOW)
const input = (over: Partial<AdvisoryInput> = {}): AdvisoryInput => ({ scope: 'campus', severity: 'warning', title: 'Gate 2 closed', body: 'Use Gate 1.', ...over })
const opts = (over: Partial<{ id: string; now: number; publish: boolean }> = {}) => ({ id: 'campus-1', now: NOW, issuer: 'Campus DRRMO · DRRMO Coordinator', publish: true, corridors, ...over })
const ok = <T extends { ok: boolean }>(r: T) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }> }
const campusAdv = (over: Partial<Advisory> = {}): Advisory =>
  ({ id: 'a', source: 'Campus', issuer: 'Campus DRRMO', title: 'T', body: '', severity: 'info', scope: 'campus', issuedAt: NOW - HOUR, ...over })

describe('creating an advisory', () => {
  it('publishes immediately: status published, fixed ID, issuer and times, newest first in the snapshot', () => {
    const r = ok(createAdvisory(base(), input({ title: '  Gate 2 closed  ', body: ' Use Gate 1. ' }), opts()))
    expect(r.advisory).toEqual({
      id: 'campus-1', source: 'Campus', issuer: 'Campus DRRMO · DRRMO Coordinator', title: 'Gate 2 closed', body: 'Use Gate 1.',
      severity: 'warning', scope: 'campus', issuedAt: NOW, status: 'published', updatedAt: NOW,
    })
    expect(r.snapshot.advisories[0]).toBe(r.advisory)
    expect(r.snapshot.updatedAt).toBe(NOW)
    expect(isActive(r.advisory, NOW)).toBe(true)
  })

  it('saves a draft that students cannot see', () => {
    const r = ok(createAdvisory(base(), input(), opts({ publish: false })))
    expect(r.advisory.status).toBe('draft')
    expect(studentAdvisories(r.snapshot.advisories, 'lipa', NOW)).toEqual([])
  })

  it('applies the corridor status only when published, not for a draft', () => {
    const draft = ok(createAdvisory(base(), input({ scope: 'lipa', corridorStatus: 'closed' }), opts({ publish: false })))
    expect(draft.snapshot.corridors.lipa.status).toBe('open')
    expect(draft.corridorChanged).toBeNull()
    const pub = ok(createAdvisory(base(), input({ scope: 'lipa', corridorStatus: 'closed', title: 'Flooding' }), opts()))
    expect(pub.snapshot.corridors.lipa).toMatchObject({ status: 'closed', note: 'Flooding', source: 'Campus DRRMO advisory' })
    expect(pub.corridorChanged).toBe('lipa')
  })

  it('sets an end time from the chosen hours', () => {
    const r = ok(createAdvisory(base(), input({ expiresInHours: 3 }), opts()))
    expect(r.advisory.expiresAt).toBe(NOW + 3 * HOUR)
  })

  it('rejects a duplicate ID instead of creating a second record', () => {
    const first = ok(createAdvisory(base(), input(), opts()))
    const again = createAdvisory(first.snapshot, input(), opts())
    expect(again).toMatchObject({ ok: false, error: 'An advisory with this ID already exists.' })
  })
})

describe('form validation', () => {
  it.each([
    ['an empty headline', input({ title: '   ' }), 'title', /Add a headline/],
    ['a headline over 90 characters', input({ title: 'x'.repeat(91) }), 'title', /90 characters/],
    ['details over 280 characters', input({ body: 'x'.repeat(281) }), 'body', /280 characters/],
    ['an unknown corridor', input({ scope: 'pablo-borbon' }), 'scope', /Choose who sees/],
    ['an unknown severity', input({ severity: 'severe' as never }), 'severity', /severity/],
    ['a corridor status on a campus-wide advisory', input({ corridorStatus: 'closed' }), 'corridorStatus', /single route/],
    ['an invalid corridor status', input({ scope: 'lipa', corridorStatus: 'flooded' as never }), 'corridorStatus', /open, slow or closed/],
    ['a negative end time', input({ expiresInHours: -1 }), 'expiresInHours', /72 hours/],
    ['an end time too far ahead', input({ expiresInHours: 100 }), 'expiresInHours', /72 hours/],
  ])('rejects %s', (_l, value, field, message) => {
    const errors = validateAdvisoryInput(value, corridors)
    expect(errors[field as keyof typeof errors]).toMatch(message)
    const r = createAdvisory(base(), value, opts())
    expect(r.ok).toBe(false)
  })

  it('accepts a valid corridor advisory with a status and an end time', () => {
    expect(validateAdvisoryInput(input({ scope: 'bauan', corridorStatus: 'slow', expiresInHours: 6 }), corridors)).toEqual({})
  })
})

describe('updating an advisory', () => {
  const published = () => ok(createAdvisory(base(), input({ expiresInHours: 6 }), opts()))

  it('edits in place: same ID, no new record, updated time set, published time kept', () => {
    const p = published()
    const r = ok(updateAdvisory(p.snapshot, 'campus-1', input({ title: 'Gate 2 reopened at 5 PM', severity: 'info' }), { now: NOW + 10 * MIN, corridors }))
    expect(r.snapshot.advisories.filter((a) => a.id === 'campus-1')).toHaveLength(1)
    expect(r.snapshot.advisories).toHaveLength(p.snapshot.advisories.length)
    expect(r.advisory).toMatchObject({ title: 'Gate 2 reopened at 5 PM', severity: 'info', status: 'published', issuedAt: NOW, updatedAt: NOW + 10 * MIN })
  })

  it('keeps, replaces or removes the end time', () => {
    const p = published()
    const keep = ok(updateAdvisory(p.snapshot, 'campus-1', input(), { now: NOW + MIN, corridors }))
    expect(keep.advisory.expiresAt).toBe(NOW + 6 * HOUR)
    const replaced = ok(updateAdvisory(p.snapshot, 'campus-1', input({ expiresInHours: 1 }), { now: NOW + MIN, corridors }))
    expect(replaced.advisory.expiresAt).toBe(NOW + MIN + HOUR)
    const removed = ok(updateAdvisory(p.snapshot, 'campus-1', input({ expiresInHours: null }), { now: NOW + MIN, corridors }))
    expect(removed.advisory.expiresAt).toBeUndefined()
  })

  it('rejects invalid edits, edits of ended advisories, and edits of PAGASA or LGU advisories', () => {
    const p = published()
    expect(updateAdvisory(p.snapshot, 'campus-1', input({ title: '' }), { now: NOW, corridors }).ok).toBe(false)
    const resolved = ok(resolveAdvisory(p.snapshot, 'campus-1', { now: NOW + MIN }))
    expect(updateAdvisory(resolved.snapshot, 'campus-1', input(), { now: NOW + 2 * MIN, corridors })).toMatchObject({ ok: false, error: expect.stringMatching(/has ended/) })
    expect(updateAdvisory(p.snapshot, 'campus-1', input(), { now: NOW + 7 * HOUR, corridors })).toMatchObject({ ok: false, error: expect.stringMatching(/has ended/) })
    const d = fixture('disrupted', NOW)
    // A real PAGASA bulletin (not simulated) belongs to its issuer; the simulated demo copy can be edited.
    const real = { ...d, advisories: d.advisories.map((a) => (a.id === 'pagasa-RA-07' ? { ...a, simulated: undefined } : a)) }
    expect(updateAdvisory(real, 'pagasa-RA-07', input(), { now: NOW, corridors })).toMatchObject({ ok: false, error: expect.stringMatching(/managed by their issuer/) })
    expect(updateAdvisory(d, 'pagasa-RA-07', input(), { now: NOW, corridors }).ok).toBe(true)
    expect(updateAdvisory(d, 'missing', input(), { now: NOW, corridors })).toMatchObject({ ok: false, error: 'That advisory no longer exists.' })
  })
})

describe('publishing and resolving', () => {
  it('publishes a draft: becomes active, publication time set, corridor status applied', () => {
    const d = ok(createAdvisory(base(), input({ scope: 'bauan', corridorStatus: 'slow' }), opts({ publish: false })))
    const p = ok(publishAdvisory(d.snapshot, 'campus-1', { now: NOW + 5 * MIN }))
    expect(p.advisory).toMatchObject({ status: 'published', issuedAt: NOW + 5 * MIN, updatedAt: NOW + 5 * MIN })
    expect(p.snapshot.corridors.bauan.status).toBe('slow')
    expect(p.snapshot.advisories).toHaveLength(1)
    expect(studentAdvisories(p.snapshot.advisories, 'bauan', NOW + 5 * MIN).map((a) => a.id)).toEqual(['campus-1'])
  })

  it('only drafts can be published, and not after their end time', () => {
    const p = ok(createAdvisory(base(), input(), opts()))
    expect(publishAdvisory(p.snapshot, 'campus-1', { now: NOW })).toMatchObject({ ok: false, error: 'Only drafts can be published.' })
    const d = ok(createAdvisory(base(), input({ expiresInHours: 1 }), opts({ publish: false })))
    expect(publishAdvisory(d.snapshot, 'campus-1', { now: NOW + 2 * HOUR })).toMatchObject({ ok: false, error: expect.stringMatching(/end time has passed/) })
  })

  it('resolves without deleting; the record remains and is no longer current', () => {
    const p = ok(createAdvisory(base(), input({ scope: 'lipa', corridorStatus: 'closed' }), opts()))
    const r = ok(resolveAdvisory(p.snapshot, 'campus-1', { now: NOW + 30 * MIN }))
    expect(r.snapshot.advisories.map((a) => a.id)).toEqual(['campus-1'])
    expect(r.advisory).toMatchObject({ status: 'resolved', resolvedAt: NOW + 30 * MIN })
    expect(phaseOf(r.advisory, NOW + 30 * MIN)).toBe('resolved')
    expect(r.snapshot.corridors.lipa.status).toBe('closed')     // corridor unchanged unless asked
    expect(resolveAdvisory(r.snapshot, 'campus-1', { now: NOW + 31 * MIN })).toMatchObject({ ok: false, error: 'This advisory is already resolved.' })
  })

  it('can mark the corridor open again when resolving', () => {
    const p = ok(createAdvisory(base(), input({ scope: 'lipa', corridorStatus: 'closed' }), opts()))
    const r = ok(resolveAdvisory(p.snapshot, 'campus-1', { now: NOW + MIN, reopenCorridor: true }))
    expect(r.snapshot.corridors.lipa.status).toBe('open')
    expect(r.corridorChanged).toBe('lipa')
  })

  it('withdraws a draft (resolved, never shown)', () => {
    const d = ok(createAdvisory(base(), input(), opts({ publish: false })))
    const w = ok(resolveAdvisory(d.snapshot, 'campus-1', { now: NOW + MIN }))
    expect(w.advisory).toMatchObject({ status: 'resolved', withdrawn: true })
    // Students never saw it, so it is not listed as "recently ended" either.
    expect(recentlyEnded(w.snapshot.advisories, 'lipa', NOW + MIN)).toEqual([])
    expect(reuseInput(w.advisory)).toEqual({ scope: 'campus', severity: input().severity, title: input().title, body: input().body, corridorStatus: input().corridorStatus ?? null, expiresInHours: null })
  })
})

describe('student visibility', () => {
  const list: Advisory[] = [
    campusAdv({ id: 'active-campus', scope: 'campus' }),
    campusAdv({ id: 'active-all', scope: 'all', status: 'published', updatedAt: NOW - 5 * MIN }),
    campusAdv({ id: 'active-lipa', scope: 'lipa' }),
    campusAdv({ id: 'active-bauan', scope: 'bauan' }),
    campusAdv({ id: 'draft', status: 'draft' }),
    campusAdv({ id: 'resolved', status: 'resolved', resolvedAt: NOW - 10 * MIN }),
    campusAdv({ id: 'expired', expiresAt: NOW - MIN }),
    campusAdv({ id: 'expires-later', expiresAt: NOW + MIN }),
    campusAdv({ id: 'resolved-long-ago', status: 'resolved', resolvedAt: NOW - 10 * HOUR }),
    campusAdv({ id: 'resolved-other-corridor', scope: 'bauan', status: 'resolved', resolvedAt: NOW - MIN }),
  ]

  it('shows only published, unresolved, unexpired advisories for the campus, all corridors and the own corridor', () => {
    expect(studentAdvisories(list, 'lipa', NOW).map((a) => a.id).sort()).toEqual(['active-all', 'active-campus', 'active-lipa', 'expires-later'])
  })

  it('excludes drafts, resolved and expired advisories from the current list', () => {
    const ids = studentAdvisories(list, 'lipa', NOW).map((a) => a.id)
    for (const hidden of ['draft', 'resolved', 'expired', 'resolved-long-ago']) expect(ids).not.toContain(hidden)
  })

  it('an advisory stops being current exactly at its end time', () => {
    const a = campusAdv({ expiresAt: NOW })
    expect(isActive(a, NOW - 1)).toBe(true)
    expect(isActive(a, NOW)).toBe(false)
    expect(phaseOf(a, NOW)).toBe('expired')
  })

  it('lists other corridors separately, and recently ended ones only as ended (within 6 hours, own area)', () => {
    expect(otherCorridorAdvisories(list, 'lipa', NOW).map((a) => a.id)).toEqual(['active-bauan'])
    expect(recentlyEnded(list, 'lipa', NOW).map((a) => a.id)).toEqual(['expired', 'resolved'])
  })

  it('the student\'s own route first, then newest change first', () => {
    const ids = studentAdvisories(list, 'lipa', NOW).map((a) => a.id)
    expect(ids[0]).toBe('active-lipa')
    expect(ids[1]).toBe('active-all')
  })

  it('campus and corridor filtering', () => {
    expect(concernsStudent(campusAdv({ scope: 'campus' }), null)).toBe(true)
    expect(concernsStudent(campusAdv({ scope: 'lipa' }), null)).toBe(false)
    expect(studentAdvisories(list, 'bauan', NOW).map((a) => a.id)).toContain('active-bauan')
    expect(studentAdvisories(list, 'bauan', NOW).map((a) => a.id)).not.toContain('active-lipa')
  })

  it('advisories without a status (PAGASA and LGU feeds, older records) count as published', () => {
    const d = fixture('disrupted', NOW)
    expect(studentAdvisories(d.advisories, 'lipa', NOW).map((a) => a.id).sort()).toEqual(['campus-suspend', 'lgu-flood-lipa', 'pagasa-RA-07'])
  })
})

describe('coordinator view', () => {
  it('groups drafts, active and ended advisories', () => {
    const list = [campusAdv({ id: 'd', status: 'draft' }), campusAdv({ id: 'p' }), campusAdv({ id: 'r', status: 'resolved' }), campusAdv({ id: 'x', expiresAt: NOW - 1 })]
    const g = coordinatorGroups(list, NOW)
    expect({ drafts: g.drafts.map((a) => a.id), active: g.active.map((a) => a.id), ended: g.ended.map((a) => a.id).sort() }).toEqual({ drafts: ['d'], active: ['p'], ended: ['r', 'x'] })
  })

  it('labels the affected area', () => {
    expect(scopeLabel('campus', corridors)).toBe('Whole campus')
    expect(scopeLabel('all', corridors)).toBe('All routes')
    expect(scopeLabel('lipa', corridors)).toBe('Lipa City route (JP Laurel Hwy)')
    expect(scopeLabel('nowhere', corridors)).toBe('Unknown area (nowhere)')
  })
})
