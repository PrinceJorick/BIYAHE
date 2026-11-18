import { describe, expect, it, vi } from 'vitest'

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }))
const { RELOAD_GUARD_MS, shouldReload } = await import('./pwa')

describe('service-worker reload guard', () => {
  it('reloads for the first update', () => {
    expect(shouldReload(1_000_000, null)).toBe(true)
    expect(shouldReload(1_000_000, Number.NaN)).toBe(true)
  })

  it('never reloads twice within the guard window (no update loop)', () => {
    expect(shouldReload(1_000_000, 1_000_000 - 1000)).toBe(false)
    expect(shouldReload(1_000_000, 1_000_000 - RELOAD_GUARD_MS - 1)).toBe(true)
  })
})
