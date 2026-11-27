// The canonical safe-spot table (Iteration 3): six spots, three campuses, owner-supplied coordinates kept to
// full precision, the old lobby name gone from every campus.
import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/20261118120000_iteration3_safe_spots.sql?raw'
import { haversineM } from '../lib/geo.js'
import { campuses, CAMPUS_IDS } from './index'

const TABLE = [
  ['alangilan', 'lounge', 'Student Lounge', 13.78393267903075, 121.07417575704717],
  ['alangilan', 'gym', 'Sparta Gymnasium', 13.784276340529747, 121.07413074951742],
  ['alangilan', 'library', 'Einstein Bldg Library, 2nd Floor', 13.784168707874697, 121.0749349027738],
  ['pablo-borbon', 'pb-gym', 'Felistiano "Sanoy" Leviste Multi-Purpose Gymnasium', 13.753079262668649, 121.05277271784234],
  ['pablo-borbon', 'pb-library', 'Main Library', 13.754549329790514, 121.0525887000107],
  ['malvar', 'mv-gym', 'Gymnasium', 14.044572113490197, 121.15574880496467],
] as const

const all = CAMPUS_IDS.flatMap((c) => campuses[c].spots.map((s) => ({ campus: c, ...s })))

describe('canonical safe spots', () => {
  it('has exactly the six supplied spots, grouped by campus', () => {
    expect(all).toHaveLength(6)
    expect(all.filter((s) => s.campus === 'alangilan')).toHaveLength(3)
    expect(all.filter((s) => s.campus === 'pablo-borbon')).toHaveLength(2)
    expect(all.filter((s) => s.campus === 'malvar')).toHaveLength(1)
  })

  it.each(TABLE)('%s · %s · %s at the exact supplied coordinates', (campus, id, name, lat, lng) => {
    const spot = campuses[campus].spots.find((s) => s.id === id)
    expect(spot?.name).toBe(name)
    // toBe, not toBeCloseTo: no rounding of the supplied values.
    expect(spot?.pos[0]).toBe(lat)
    expect(spot?.pos[1]).toBe(lng)
  })

  it('stores numeric [lat, lng] (never swapped): latitude ~13–14 °N, longitude ~121 °E', () => {
    for (const s of all) {
      expect(typeof s.pos[0]).toBe('number')
      expect(s.pos[0]).toBeGreaterThan(13)
      expect(s.pos[0]).toBeLessThan(15)
      expect(s.pos[1]).toBeGreaterThan(120)
      expect(s.pos[1]).toBeLessThan(122)
    }
  })

  it('keeps each spot on its own campus (within 500 m of that campus point, far from the others)', () => {
    for (const s of all) {
      expect(haversineM(s.pos, campuses[s.campus].location)).toBeLessThan(500)
      for (const other of CAMPUS_IDS.filter((c) => c !== s.campus)) expect(haversineM(s.pos, campuses[other].location)).toBeGreaterThan(2000)
    }
  })

  it('uses unique IDs across campuses', () => {
    expect(new Set(all.map((s) => s.id)).size).toBe(all.length)
  })

  it('no longer uses the old lobby name or ID anywhere in the registry', () => {
    expect(JSON.stringify(campuses)).not.toMatch(/cics|lobby/i)
  })

  it('derives walking minutes from the coordinates (straight-line estimate at 75 m/min, rounded up)', () => {
    for (const s of all) expect(s.walkMin).toBe(Math.max(1, Math.ceil(haversineM(campuses[s.campus].location, s.pos) / 75)))
    expect(Object.fromEntries(all.map((s) => [s.id, s.walkMin]))).toEqual({ lounge: 1, gym: 1, library: 1, 'pb-gym': 4, 'pb-library': 3, 'mv-gym': 2 })
  })

  it('leaves capacity unassessed (null) where no source supports a number', () => {
    expect(Object.fromEntries(all.map((s) => [s.id, s.capacity]))).toEqual({ lounge: 150, gym: 1030, library: 250, 'pb-gym': 570, 'pb-library': 230, 'mv-gym': null })
  })
})

// Static guard for the Supabase migration (it cannot run in unit tests): the six rows carry the registry's
// names and exact coordinates in PostGIS order (longitude first).
describe('Supabase migration matches the registry', () => {
  it.each(TABLE)('%s · %s row', (_campus, id, name, lat, lng) => {
    const line = migration.split('\n').find((l) => l.trimStart().startsWith(`('${id}',`))
    expect(line).toBeDefined()
    expect(line).toContain(`'${name}'`)
    expect(line).toContain(`POINT(${lng} ${lat})`)
  })

  it('renames the legacy record in place and is re-runnable', () => {
    expect(migration).toContain("update safe_spots set id = 'lounge'")
    expect(migration).toContain('on conflict (id) do update')
    expect(migration).toContain('drop not null')
  })
})
