// Supabase advisory row mapping (src/lib/supabase.ts): lifecycle fields travel in the existing `payload`
// jsonb column, so the schema needs no new columns. Pure mapping only; no network.
import { describe, expect, it } from 'vitest'
import type { Advisory } from '../data'
import { advisoryFromRow, advisoryRow, type AdvisoryDbRow } from './supabase'

const T = Date.UTC(2026, 10, 17, 7, 0)
const full: Advisory = {
  id: 'campus-1', source: 'Campus', issuer: 'Campus DRRMO · DRRMO Coordinator', title: 'Gate 2 closed', body: 'Use Gate 1.',
  severity: 'warning', scope: 'lipa', issuedAt: T, status: 'published', updatedAt: T + 1000, expiresAt: T + 3_600_000, corridorStatus: 'closed',
}

describe('advisory rows', () => {
  it('round-trips every lifecycle field through payload.lifecycle', () => {
    const row = advisoryRow(full)
    expect(row).toMatchObject({ id: 'campus-1', issued_at: new Date(T).toISOString(), payload: { lifecycle: { status: 'published', updatedAt: T + 1000, expiresAt: T + 3_600_000, corridorStatus: 'closed' } } })
    expect(advisoryFromRow(row as AdvisoryDbRow)).toEqual(full)
    const resolved = { ...full, status: 'resolved' as const, resolvedAt: T + 5000 }
    expect(advisoryFromRow(advisoryRow(resolved) as AdvisoryDbRow)).toEqual(resolved)
  })

  it('advisories without lifecycle fields (PAGASA, LGU, older rows) write a null payload and read back as published', () => {
    const plain: Advisory = { id: 'pagasa-RA-07', source: 'PAGASA', issuer: 'PAGASA', title: 'Rain', body: '', severity: 'info', scope: 'all', issuedAt: T }
    const row = advisoryRow(plain)
    expect(row.payload).toBeNull()
    expect(advisoryFromRow({ ...row, body: null } as AdvisoryDbRow)).toEqual(plain)
  })

  it('malformed lifecycle values are dropped rather than trusted', () => {
    const row: AdvisoryDbRow = {
      id: 'x', source: 'Campus', issuer: 'i', title: 't', body: null, severity: 'info', scope: 'campus', issued_at: new Date(T).toISOString(),
      payload: { lifecycle: { status: 'approved', expiresAt: 'tomorrow', corridorStatus: 'flooded', updatedAt: Number.NaN } },
    }
    expect(advisoryFromRow(row)).toEqual({ id: 'x', source: 'Campus', issuer: 'i', title: 't', body: '', severity: 'info', scope: 'campus', issuedAt: T })
  })
})
