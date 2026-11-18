// Coordinator → student advisory workflow through the real store, with the Supabase layer and IndexedDB
// mocked (no network, no browser storage). Covers access control, the single shared snapshot both views
// read, no duplicate records, and server failures.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Advisory, Snapshot } from '../data'

const remote = vi.hoisted(() => ({
  configured: true,
  fetchSnapshot: vi.fn(async (): Promise<unknown> => null),
  subscribe: vi.fn(async () => () => {}),
  pushAdvisory: vi.fn(async (_a: Advisory) => true),
  pushCorridor: vi.fn(async (_id: string, _c: unknown) => true),
  pushSpot: vi.fn(async () => true),
  pushAll: vi.fn(async (_s: Snapshot) => true),
}))
vi.mock('./supabase', () => remote)
vi.mock('./idb', () => ({ idbGet: vi.fn(async () => undefined), idbSet: vi.fn(async () => {}) }))
vi.mock('./weather', () => ({ fetchWeather: vi.fn(async () => { throw new Error('offline') }) }))

// The store reads navigator.onLine at load; Node has no such flag, so present an online browser.
vi.stubGlobal('navigator', { onLine: true })
const store = await import('./store')
const { studentAdvisories } = await import('./advisories')

const input = { scope: 'lipa', severity: 'critical' as const, title: 'Flooding near Balagtas', body: 'Avoid the area.', corridorStatus: 'closed' as const }
const flush = () => new Promise((r) => setTimeout(r, 0))
const studentSees = () => studentAdvisories(store.getState().snapshot.advisories, 'lipa', Date.now()).map((a) => a.title)

beforeEach(() => {
  store.setScenario('clear')          // fresh shared snapshot with no advisories
  store.chooseRole('staff')
  store.setStaffRole('DRRMO Coordinator')
  for (const f of [remote.pushAdvisory, remote.pushCorridor]) { f.mockClear(); f.mockResolvedValue(true) }
})

describe('access control', () => {
  it('only the DRRMO Coordinator may manage advisories', () => {
    expect(store.canManageAdvisories({ role: 'staff', staffRole: 'DRRMO Coordinator' })).toBe(true)
    expect(store.canManageAdvisories({ role: 'staff', staffRole: 'Building Marshal' })).toBe(false)
    expect(store.canManageAdvisories({ role: 'staff', staffRole: 'Guard on Duty' })).toBe(false)
    expect(store.canManageAdvisories({ role: 'student', staffRole: 'DRRMO Coordinator' })).toBe(false)
    expect(store.canManageAdvisories({ role: null, staffRole: 'DRRMO Coordinator' })).toBe(false)
  })

  it.each([
    ['a student', () => store.chooseRole('student')],
    ['a guard on duty', () => store.setStaffRole('Guard on Duty')],
    ['a building marshal', () => store.setStaffRole('Building Marshal')],
  ])('%s cannot create, edit, publish or resolve; nothing changes and nothing is sent', (_l, become) => {
    const created = store.createAdvisory(input, { publish: false })
    expect(created.ok).toBe(true)
    const id = created.ok ? created.advisory.id : ''
    const before = store.getState().snapshot
    become()
    for (const r of [
      store.createAdvisory(input, { publish: true }),
      store.editAdvisory(id, { ...input, title: 'Changed' }),
      store.publishDraft(id),
      store.resolveAdvisory(id),
    ]) expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Only the DRRMO Coordinator/) })
    expect(store.getState().snapshot).toBe(before)
    expect(store.getState().toast?.text).toMatch(/Only the DRRMO Coordinator/)
    expect(remote.pushAdvisory).toHaveBeenCalledTimes(1)       // only the coordinator's draft
  })
})

describe('coordinator to student, through one shared snapshot', () => {
  it('draft → publish → edit → resolve, always the same single record', async () => {
    const draft = store.createAdvisory(input, { publish: false })
    if (!draft.ok) throw new Error(draft.error)
    const id = draft.advisory.id
    expect(studentSees()).toEqual([])                                   // drafts are invisible to students
    expect(store.getState().snapshot.corridors.lipa.status).toBe('open')

    expect(store.publishDraft(id).ok).toBe(true)
    expect(studentSees()).toEqual(['Flooding near Balagtas'])
    expect(store.getState().snapshot.corridors.lipa.status).toBe('closed')
    expect(store.getState().toast?.text).toMatch(/Advisory published/)

    expect(store.editAdvisory(id, { ...input, title: 'Flooding near Balagtas: knee-deep' }).ok).toBe(true)
    expect(studentSees()).toEqual(['Flooding near Balagtas: knee-deep'])

    expect(store.resolveAdvisory(id, { reopenCorridor: true }).ok).toBe(true)
    expect(studentSees()).toEqual([])
    expect(store.getState().snapshot.corridors.lipa.status).toBe('open')

    const records = store.getState().snapshot.advisories.filter((a) => a.id === id)
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('resolved')
    await flush()
    // Every write upserts the same row ID: no duplicate records.
    expect(new Set(remote.pushAdvisory.mock.calls.map(([a]) => a.id))).toEqual(new Set([id]))
    expect(remote.pushAdvisory).toHaveBeenCalledTimes(4)
    // publish applies closed; saving the edited (still published) advisory re-applies it; resolving reopens
    expect(remote.pushCorridor.mock.calls.map(([cid, c]) => [cid, (c as { status: string }).status])).toEqual([['lipa', 'closed'], ['lipa', 'closed'], ['lipa', 'open']])
  })

  it('invalid input is rejected with field errors and nothing is stored or sent', () => {
    const before = store.getState().snapshot
    const r = store.createAdvisory({ ...input, title: '  ' }, { publish: true })
    expect(r).toMatchObject({ ok: false, errors: { title: expect.stringMatching(/headline/) } })
    expect(store.getState().snapshot).toBe(before)
    expect(remote.pushAdvisory).not.toHaveBeenCalled()
  })

  it('two creations get different IDs', () => {
    const a = store.createAdvisory({ ...input, title: 'One' }, { publish: true })
    const b = store.createAdvisory({ ...input, title: 'Two' }, { publish: true })
    expect(a.ok && b.ok && a.advisory.id !== b.advisory.id).toBe(true)
  })
})

describe('server failures', () => {
  it('a failed Supabase write keeps the change on this device and tells the coordinator', async () => {
    remote.fetchSnapshot.mockResolvedValueOnce(store.getState().snapshot)    // connected: backend = supabase
    await store.refresh()
    expect(store.getState().backend).toBe('supabase')
    remote.pushAdvisory.mockResolvedValue(false)
    const r = store.createAdvisory(input, { publish: true })
    expect(r.ok).toBe(true)
    expect(studentSees()).toEqual(['Flooding near Balagtas'])               // still shared on this device
    await flush()
    expect(store.getState().toast?.text).toMatch(/Could not reach the server/)
  })
})
