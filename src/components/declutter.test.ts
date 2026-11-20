import { describe, expect, it } from 'vitest'
import { candidateShifts, placeLabels, type Box } from './map/declutter'

const box = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h })
const MAP = box(0, 0, 400, 600)

describe('map label placement', () => {
  it('keeps a label where it is when nothing is in the way', () => {
    expect(placeLabels([], [box(100, 100, 120, 24)], MAP)).toEqual([[0, 0]])
  })

  it('moves a label off a pin instead of hiding it (above first)', () => {
    const label = box(100, 100, 120, 24)
    const pin = box(150, 100, 30, 30)
    const [p] = placeLabels([pin], [label], MAP)
    expect(p).toEqual(candidateShifts(label)[1])
  })

  it('moves the lower-priority of two colliding labels, e.g. a route tag and a destination name', () => {
    const route = box(100, 200, 150, 24) // "Open · P. Burgos" (placed first: higher priority)
    const town = box(120, 205, 160, 24) // "Batangas City proper"
    const [a, b] = placeLabels([], [route, town], MAP)
    expect(a).toEqual([0, 0])
    expect(b).not.toEqual([0, 0])
    expect(b).not.toBeNull()
  })

  it('never moves a label outside the map, and hides it when no spot is free', () => {
    const label = box(0, 0, 120, 24)
    const blockers = [box(0, 0, 400, 600)] // a pin covering everything
    expect(placeLabels(blockers, [label], MAP)).toEqual([null])
    const atTop = placeLabels([box(40, 0, 30, 24)], [box(10, 0, 120, 24)], MAP)[0]!
    expect(atTop[1]).toBeGreaterThanOrEqual(0) // not moved above the top edge
  })
})

describe('map label placement near the edge', () => {
  it('moves a label that the map edge would clip to a free spot inside', () => {
    const label = box(300, 100, 140, 24) // runs past the right edge at 400
    const [p] = placeLabels([], [label], MAP)
    expect(p).toEqual(candidateShifts(label)[3]) // moved left
  })
})
