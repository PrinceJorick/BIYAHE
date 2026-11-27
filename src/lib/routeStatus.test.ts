import { describe, expect, it } from 'vitest'
import { campuses } from '../campuses'
import { DEMO_HAZARDS, fixture } from '../data'
import { distanceToPathM, routesThrough } from './hazards'
import { recommend, routePlaces, spotPlaces } from './places'
import { routeMessage, routeStates, routeStatus, STALE_AFTER_MIN } from './routeStatus'
import type { Corridor, CorridorState } from '../types'

const NOW = Date.UTC(2026, 10, 28, 8)
const MIN = 60_000

describe('routeStatus: the three rules', () => {
  const cs = (status: CorridorState['status']): CorridorState => ({ status, minLo: 10, minHi: 15, note: '', source: 'x', provenance: 'official' })
  it('flooded/closed → closed, even when the data is old', () => {
    expect(routeStatus(cs('closed'), false)).toBe('closed')
    expect(routeStatus(cs('closed'), true)).toBe('closed')
  })
  it('open with no hazard → clear (open) only while the data is current', () => {
    expect(routeStatus(cs('open'), false)).toBe('open')
    expect(routeStatus(cs('open'), true)).toBe('unknown')
    expect(routeStatus(cs('slow'), true)).toBe('unknown')
  })
  it('missing or malformed report → unknown', () => {
    expect(routeStatus(undefined, false)).toBe('unknown')
    expect(routeStatus({ ...cs('open'), status: 'bogus' as never }, false)).toBe('unknown')
  })
  it('messages match the rule', () => {
    expect(routeMessage({ status: 'closed', hazard: 'flood' })).toBe('Route is flooded. Do not proceed through this route.')
    expect(routeMessage({ status: 'open' })).toBe('Route is clear. You may proceed home.')
    expect(routeMessage({ status: 'unknown' })).toBe('Unable to confirm route conditions. Verify the latest available advisory.')
  })
})

describe('distanceToPathM', () => {
  it('measures to the segment, not only the vertices', () => {
    // A point midway along a 2 km east-west segment, 100 m north of it.
    const path: [number, number][] = [[14, 121], [14, 121.0185]]
    expect(distanceToPathM([14.0009, 121.00925], path)).toBeGreaterThan(90)
    expect(distanceToPathM([14.0009, 121.00925], path)).toBeLessThan(110)
  })
})

describe.each(Object.values(campuses))('$id: simulated conditions agree everywhere', (campus) => {
  const corridors: readonly Corridor[] = campus.corridors

  it('every demo hazard lies on at least one route', () => {
    for (const h of DEMO_HAZARDS[campus.id]) expect(routesThrough(h, corridors).length, h.id).toBeGreaterThan(0)
  })

  it('flooding: every route is closed or slow (heavy traffic), none clear', () => {
    const snap = fixture('disrupted', NOW, campus)
    const states = routeStates(snap, corridors, NOW)
    for (const c of corridors) {
      expect(['closed', 'slow'], c.id).toContain(states[c.id].status)
      const r = routePlaces(snap, corridors, null, c.id, NOW).find((x) => x.id === c.id)!
      expect(['closed', 'heavy'], c.id).toContain(r.traffic.level)
    }
  })

  it('clear: every route is clear and the student is told to head home', () => {
    const snap = fixture('clear', NOW, campus)
    const states = routeStates(snap, corridors, NOW)
    for (const c of corridors) {
      expect(states[c.id].status, c.id).toBe('open')
      expect(routeMessage(states[c.id])).toBe('Route is clear. You may proceed home.')
      const opts = recommend(routePlaces(snap, corridors, null, c.id, NOW), spotPlaces(snap.spots))
      expect(opts[0].place.kind, c.id).toBe('route')
      expect(opts[0].recommended, c.id).toBe(true)
    }
  })

  it('flooded: exactly the routes through the flood are closed, never recommended, and each has its advisory', () => {
    const snap = fixture('disrupted', NOW, campus)
    const states = routeStates(snap, corridors, NOW)
    const flood = DEMO_HAZARDS[campus.id].find((h) => h.kind === 'flood')!
    const flooded = routesThrough(flood, corridors)
    expect(flooded.length).toBeGreaterThan(0)
    for (const c of corridors) {
      const through = distanceToPathM(flood.pos, c.path) <= flood.radiusM
      expect(states[c.id].status === 'closed', c.id).toBe(through)
      if (through) {
        expect(routeMessage(states[c.id])).toBe('Route is flooded. Do not proceed through this route.')
        expect(snap.advisories.some((a) => a.scope === c.id && a.severity === 'critical' && a.simulated), c.id).toBe(true)
        const opts = recommend(routePlaces(snap, corridors, null, c.id, NOW), spotPlaces(snap.spots))
        // A flooded route is never the recommendation, for its own commuters or anyone else's.
        for (const o of opts) if (o.place.kind === 'route' && o.place.id === c.id) expect(o.recommended).toBe(false)
        expect(opts.find((o) => o.recommended)?.place.kind ?? 'spot').toBe('spot')
      } else {
        expect(snap.advisories.some((a) => a.scope === c.id && a.severity === 'critical'), c.id).toBe(false)
      }
    }
    // Other students' suggestions never offer a flooded route as the alternative.
    for (const c of corridors.filter((x) => !flooded.includes(x.id))) {
      const opts = recommend(routePlaces(snap, corridors, null, c.id, NOW), spotPlaces(snap.spots))
      expect(opts.some((o) => o.place.kind === 'route' && flooded.includes(o.place.id) && o.recommended)).toBe(false)
    }
    const advised = [...new Set(snap.advisories.filter((a) => a.severity === 'critical').map((a) => a.scope))].sort()
    expect(advised).toEqual(flooded.toSorted())
  })

  it('unknown: old or missing data never shows a route as clear, and the student is asked to verify', () => {
    const old = { ...fixture('clear', NOW, campus), updatedAt: NOW - (STALE_AFTER_MIN + 8) * MIN }
    const states = routeStates(old, corridors, NOW)
    for (const c of corridors) {
      expect(states[c.id].status, c.id).toBe('unknown')
      expect(states[c.id].note).not.toMatch(/no hazards/i)
      expect(routeMessage(states[c.id])).toBe('Unable to confirm route conditions. Verify the latest available advisory.')
      const opts = recommend(routePlaces(old, corridors, null, c.id, NOW), spotPlaces(old.spots))
      expect(opts.some((o) => o.place.kind === 'route' && o.recommended), c.id).toBe(false)
    }
    const missing = fixture('clear', NOW, campus)
    delete missing.corridors[corridors[0].id]
    expect(routeStates(missing, corridors, NOW)[corridors[0].id].status).toBe('unknown')
    // A flood stays closed when the data ages: an old closure is still a reason not to go.
    const oldFlood = { ...fixture('disrupted', NOW, campus), updatedAt: NOW - 60 * MIN }
    const flood = DEMO_HAZARDS[campus.id].find((h) => h.kind === 'flood')!
    for (const id of routesThrough(flood, corridors)) expect(routeStates(oldFlood, corridors, NOW)[id].status).toBe('closed')
  })
})
