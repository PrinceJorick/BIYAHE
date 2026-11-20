import { describe, expect, it } from 'vitest'
import { corridors, fixture } from '../data'
import { findPlace, placeArg, recommend, recommendationReason, routePlaces, shortSpotName, spotPlaces } from './places'

const NOW = Date.parse('2026-11-19T09:00:00Z')

describe('places', () => {
  const snap = fixture('clear', NOW)
  const routes = routePlaces(snap, corridors, null, 'batangas', NOW)
  const spots = spotPlaces(snap.spots)

  it('lists every route home, marking the student\'s own', () => {
    expect(routes.map((r) => r.id)).toEqual(corridors.map((c) => c.id))
    expect(routes.filter((r) => r.mine).map((r) => r.id)).toEqual(['batangas'])
  })

  it('lists safe spots nearest first with short names for tight places', () => {
    expect(spots.map((s) => s.short)).toContain('Sparta Gym')
    for (let i = 1; i < spots.length; i++) expect(spots[i - 1].spot.walkMin).toBeLessThanOrEqual(spots[i].spot.walkMin)
    expect(shortSpotName({ id: 'unknown', name: 'Some Hall' })).toBe('Some Hall')
  })

  it('finds a place from its URL argument', () => {
    expect(findPlace('route/lipa', routes, spots)?.id).toBe('lipa')
    expect(findPlace(placeArg(spots[0]), routes, spots)).toBe(spots[0])
    expect(findPlace('route/nowhere', routes, spots)).toBeNull()
    expect(findPlace('bus/lipa', routes, spots)).toBeNull()
    expect(findPlace(null, routes, spots)).toBeNull()
  })
})

describe('recommendations', () => {
  it('open route: head home first (recommended), then the nearest safe spot, then another open route', () => {
    const snap = fixture('clear', NOW)
    const o = recommend(routePlaces(snap, corridors, null, 'batangas', NOW), spotPlaces(snap.spots))
    expect(o).toHaveLength(3)
    expect(o.map((x) => `${x.place.kind}/${x.place.id}`).slice(0, 1)).toEqual(['route/batangas'])
    expect(o[0]).toMatchObject({ verb: 'Head home to', recommended: true })
    expect(o[1].place.kind).toBe('spot')
    expect(o[2].place.kind).toBe('route')
    expect(o.filter((x) => x.recommended)).toHaveLength(1)
  })

  it('closed route: the nearest safe spot with room is the recommendation; the closed route is never recommended', () => {
    const snap = fixture('disrupted', NOW)   // corridors[0] (lipa) is closed
    const o = recommend(routePlaces(snap, corridors, null, 'lipa', NOW), spotPlaces(snap.spots))
    expect(o[0]).toMatchObject({ verb: 'Wait at', recommended: true })
    expect(o[0].place.kind).toBe('spot')
    expect(o[1].place).toMatchObject({ kind: 'route', id: 'lipa' })
    expect(o[1].recommended).toBe(false)
    expect(o[2].place.kind === 'route' ? o[2].place.cs.status : 'open').not.toBe('closed')
  })

  it('every spot full and the route closed: nothing is marked recommended', () => {
    const snap = fixture('disrupted', NOW)
    const full = snap.spots.map((s) => ({ ...s, capacity: 10, occupied: 10 }))
    const o = recommend(routePlaces(snap, corridors, null, 'lipa', NOW), spotPlaces(full))
    expect(o.some((x) => x.recommended && x.place.kind === 'spot')).toBe(false)
    expect(o.find((x) => x.place.id === 'lipa')?.recommended).toBe(false)
  })
})

describe('recommendation reasons', () => {
  it('open route: the rule and the traffic fact with its source; alternatives are labelled, never "safe"', () => {
    const snap = fixture('clear', NOW)
    const o = recommend(routePlaces(snap, corridors, null, 'batangas', NOW), spotPlaces(snap.spots))
    const r = recommendationReason(o, { rainPeakPct: null, warnings: 0 })!
    expect(r.rule).toBe('Your usual route is open, so heading home comes first.')
    expect(r.facts).toHaveLength(1)
    expect(r.facts[0]).toMatch(/usually \d+ min \(estimate from route reports\)/)
    expect(o.find((x) => x.verb === 'Suggested alternative')).toBeDefined()
    expect(JSON.stringify(r)).not.toMatch(/\bsafe\b(?! spot)/i)
  })

  it('closed route: the nearest safe spot with room, its count, rain and warnings as context', () => {
    const snap = fixture('disrupted', NOW)
    const o = recommend(routePlaces(snap, corridors, null, 'lipa', NOW), spotPlaces(snap.spots))
    const r = recommendationReason(o, { rainPeakPct: 70, warnings: 1 })!
    expect(r.rule).toMatch(/closed by an advisory/)
    expect(r.facts[0]).toMatch(/is closed/)
    expect(r.facts.some((f) => /spaces left|not confirmed/.test(f))).toBe(true)
    expect(r.facts).toContain('Up to 70% chance of rain in the next 6 hours (Google Weather forecast, estimate).')
    expect(r.facts).toContain('1 weather warning from PAGASA in force (official).')
  })

  it('no rain fact below 30%, and nothing without options', () => {
    const snap = fixture('clear', NOW)
    const o = recommend(routePlaces(snap, corridors, null, 'batangas', NOW), spotPlaces(snap.spots))
    expect(recommendationReason(o, { rainPeakPct: 20, warnings: 0 })!.facts.join()).not.toMatch(/rain/)
    expect(recommendationReason([], { rainPeakPct: null, warnings: 0 })).toBeNull()
  })
})
