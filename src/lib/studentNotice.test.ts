import { describe, expect, it } from 'vitest'
import { corridors, fixture } from '../data'
import { createAdvisory, resolveAdvisory, updateAdvisory } from './advisories'
import { studentNotice } from './studentNotice'

const NOW = Date.UTC(2026, 10, 28, 8)
const ok = <T extends { ok: boolean }>(r: T) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }> }
const opts = (publish = true) => ({ id: 'campus-x', now: NOW, issuer: 'Campus DRRMO', publish, corridors })

describe('studentNotice', () => {
  const base = fixture('clear', NOW)
  it('tells the student their route closed when an advisory closes it', () => {
    const next = ok(createAdvisory(base, { scope: 'rosario', severity: 'critical', title: 'Landslide', body: '', corridorStatus: 'closed' }, opts())).snapshot
    expect(studentNotice(base, next, corridors, 'rosario', NOW)).toMatchObject({ text: 'Your route to Rosario is now Closed.', urgent: true })
    // Another student only hears about it if it concerns them (it does not: other route).
    expect(studentNotice(base, next, corridors, 'lipa', NOW)).toBeNull()
  })
  it('a new campus-wide advisory, then its update, then its resolution', () => {
    const a = ok(createAdvisory(base, { scope: 'campus', severity: 'warning', title: 'Gate 2 closed', body: '' }, opts())).snapshot
    expect(studentNotice(base, a, corridors, 'lipa', NOW)?.text).toBe('New campus advisory: Gate 2 closed')
    const b = ok(updateAdvisory(a, 'campus-x', { scope: 'campus', severity: 'warning', title: 'Gate 2 closed until 6 PM', body: '' }, { now: NOW + 60_000, corridors })).snapshot
    expect(studentNotice(a, b, corridors, 'lipa', NOW + 60_000)?.text).toBe('Advisory updated: Gate 2 closed until 6 PM')
    const c = ok(resolveAdvisory(b, 'campus-x', { now: NOW + 120_000 })).snapshot
    expect(studentNotice(b, c, corridors, 'lipa', NOW + 120_000)?.text).toBe('Advisory resolved: Gate 2 closed until 6 PM')
  })
  it('a draft is never announced', () => {
    const d = ok(createAdvisory(base, { scope: 'campus', severity: 'warning', title: 'Draft', body: '' }, opts(false))).snapshot
    expect(studentNotice(base, d, corridors, 'lipa', NOW)).toBeNull()
  })
  it('respects the alert preferences', () => {
    const a = ok(createAdvisory(base, { scope: 'campus', severity: 'warning', title: 'Gate 2 closed', body: '' }, opts())).snapshot
    expect(studentNotice(base, a, corridors, 'lipa', NOW, () => false)).toBeNull()
  })
})
