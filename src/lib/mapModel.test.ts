import { describe, expect, it } from 'vitest'
import { CAMPUS, corridors, fixture } from '../data'
import { haversineM } from './geo.js'
import { buildMapModel, type MapModelInput } from './mapModel'
import type { WalkRoute } from './walkRoute'

const NOW = Date.parse('2026-11-19T09:00:00Z')
const base = (o: Partial<MapModelInput> = {}): MapModelInput => ({
  mode: 'student', campus: CAMPUS, corridors, snapshot: fixture('disrupted', NOW), mineId: 'batangas', focus: null,
  showAll: false, googlePaths: null, walk: null, ...o,
})

describe('map model', () => {
  it('student, nothing chosen: only their own route, in focus, with its town marked', () => {
    const m = buildMapModel(base())
    expect(m.lines.map((l) => [l.id, l.focus])).toEqual([['batangas', true]])
    expect(m.ends.map((e) => e.name)).toEqual(['Batangas City proper'])
    expect(m.fit).toContainEqual(CAMPUS)
  })

  it('a chosen route is drawn and focused next to the student\'s own', () => {
    const m = buildMapModel(base({ focus: { kind: 'route', id: 'lipa' } }))
    expect(m.lines.map((l) => [l.id, l.focus, l.status])).toEqual([['lipa', true, 'closed'], ['batangas', false, 'open']])
  })

  it('show all / staff: every route; staff never focuses one', () => {
    expect(buildMapModel(base({ showAll: true })).lines).toHaveLength(corridors.length)
    const staff = buildMapModel(base({ mode: 'staff' }))
    expect(staff.lines.every((l) => !l.focus)).toBe(true)
    expect(staff.ends).toEqual([])
  })

  it('uses Google geometry when given, and needs the OSM credit only for OSM-derived lines', () => {
    const g = { batangas: { durationS: 1, staticS: 1, distanceM: 1, path: [CAMPUS, [13.76, 121.06]] as [number, number][], fetchedAt: NOW } }
    const m = buildMapModel(base({ googlePaths: g }))
    expect(m.lines[0]).toMatchObject({ source: 'google', path: g.batangas.path })
    expect(m.osmCredit).toBe(false)
    expect(buildMapModel(base()).osmCredit).toBe(true)
  })

  it('a chosen spot: selected marker, mapped walking path drawn, never a straight-line estimate', () => {
    const spot = fixture('clear', NOW).spots[0]
    const walk = (mode: WalkRoute['mode']): WalkRoute => ({ mode, spotId: spot.id, path: mode === 'estimate' ? null : [CAMPUS, spot.pos], distanceM: 50, minutes: 1, fetchedAt: NOW, reason: null })
    const live = buildMapModel(base({ focus: { kind: 'spot', id: spot.id }, walk: walk('live') }))
    expect(live.spots.find((s) => s.selected)?.id).toBe(spot.id)
    expect(live.walk).toEqual([CAMPUS, spot.pos])
    expect(live.lines.every((l) => !l.focus)).toBe(true)
    expect(live.fit).toEqual([CAMPUS, spot.pos, CAMPUS, spot.pos])
    expect(buildMapModel(base({ focus: { kind: 'spot', id: spot.id }, walk: walk('estimate') })).walk).toBeNull()
  })

  it('overview maps label only routes that are not open, and labels never sit on top of each other', () => {
    const staff = buildMapModel(base({ mode: 'staff' }))
    const labelled = staff.lines.filter((l) => l.labelAt)
    expect(labelled.map((l) => l.status).every((st) => st !== 'open')).toBe(true)
    expect(labelled.map((l) => l.id).sort()).toEqual(['bauan', 'lipa'])   // disrupted: lipa closed, bauan slow
    for (const a of labelled) for (const b of labelled) if (a !== b) expect(haversineM(a.labelAt!, b.labelAt!)).toBeGreaterThan(1000)
    // …and never on the campus pin; every staff line is drawn strong.
    for (const l of labelled) expect(haversineM(l.labelAt!, CAMPUS)).toBeGreaterThan(1000)
    expect(staff.lines.every((l) => l.strong)).toBe(true)
  })

  it('the route in focus is always labelled; a short route near campus gives way rather than cover the campus pin', () => {
    const m = buildMapModel(base({ focus: { kind: 'route', id: 'lipa' } }))
    expect(m.lines.find((l) => l.id === 'lipa')!.labelAt).not.toBeNull()
    expect(m.lines.find((l) => l.id === 'batangas')!.labelAt).toBeNull()   // 4.5 km route in a 25 km view
    expect(buildMapModel(base()).lines[0].labelAt).not.toBeNull()          // own route alone: labelled
  })
})
