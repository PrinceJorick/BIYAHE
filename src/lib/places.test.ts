import { describe, expect, it } from 'vitest'
import { corridors, fixture } from '../data'
import { findPlace, placeArg, recommend, routePlaces, shortSpotName, spotPlaces } from './places'

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
