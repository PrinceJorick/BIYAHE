import { describe, expect, it } from 'vitest'
import { corridors, fixture } from '../data'
import type { HourForecast } from '../types'
import { routePlaces } from './places'
import { rainNotice, trafficNotices } from './notices'

const NOW = Date.parse('2026-11-19T09:10:00Z')   // 5:10 PM in Manila
const hours = (pcts: (number | null)[]): HourForecast[] => pcts.map((p, i) => ({ t: Date.parse('2026-11-19T09:00:00Z') + i * 3_600_000, rainPct: p, code: 61, tempC: 27 }))

describe('rain notice', () => {
  it('names the wettest of the next hours when rain is likely', () => {
    const n = rainNotice(hours([20, 40, 75, 10]), NOW - 60_000, NOW)!
    expect(n).toMatchObject({ title: 'Rain likely around 7 PM', level: 'high', source: 'Open-Meteo forecast', at: NOW - 60_000 })
    expect(n.detail).toMatch(/^75% chance of rain/)
  })
  it('says "possible" for 30-59% and "this hour" for the current hour', () => {
    expect(rainNotice(hours([45, 10]), NOW, NOW)).toMatchObject({ title: 'Rain possible this hour', level: 'mid' })
  })
  it('stays quiet when rain is unlikely or there is no forecast', () => {
    expect(rainNotice(hours([10, 20, null]), NOW, NOW)).toBeNull()
    expect(rainNotice(undefined, NOW, NOW)).toBeNull()
    expect(rainNotice(hours([0, 0, 0, 0, 0, 0, 0, 90]), NOW, NOW)).toBeNull()  // more than six hours away
  })
})

describe('traffic notices', () => {
  it('lists routes with live moderate or heavy traffic only', () => {
    const snap = fixture('clear', NOW)
    const live = { lipa: { durationS: 2400, staticS: 1260, distanceM: 1, path: null, fetchedAt: NOW }, batangas: { durationS: 400, staticS: 390, distanceM: 1, path: null, fetchedAt: NOW } }
    const n = trafficNotices(routePlaces(snap, corridors, live, 'lipa', NOW))
    expect(n).toHaveLength(1)
    expect(n[0]).toMatchObject({ id: 'traffic-lipa', title: 'Heavy traffic to Lipa City', level: 'high', source: 'Google live traffic' })
  })
  it('never derives notices from estimates', () => {
    const snap = fixture('disrupted', NOW)
    expect(trafficNotices(routePlaces(snap, corridors, null, 'lipa', NOW))).toEqual([])
  })
})
