import { describe, expect, it } from 'vitest'
import { corridors, corridorStateFor } from '../data'
import type { HourForecast } from '../types'
import type { LiveRoute } from './googleRoutes'
import { departureOptions, levelFromRatio, LIVE_FRESH_MS, rainLevel, trafficFor } from './traffic'

const NOW = Date.parse('2026-11-19T09:00:00Z')
const lipa = corridors.find((c) => c.id === 'lipa')!   // usual 50 min
const live = (durationS: number, staticS: number, fetchedAt = NOW): LiveRoute => ({ durationS, staticS, distanceM: 25500, path: null, fetchedAt })

describe('traffic level', () => {
  it.each([[1, 'light'], [1.24, 'light'], [1.25, 'moderate'], [1.59, 'moderate'], [1.6, 'heavy'], [3, 'heavy']] as const)('ratio %d → %s', (r, l) => expect(levelFromRatio(r)).toBe(l))
})

describe('trafficFor', () => {
  it('a closed route is Closed (official) whatever live traffic says', () => {
    const t = trafficFor(lipa, corridorStateFor(lipa, 'closed'), live(1260, 1260), NOW)
    expect(t).toMatchObject({ level: 'closed', source: 'official' })
  })

  it('an open route uses fresh live traffic, scaling the usual commute', () => {
    const t = trafficFor(lipa, corridorStateFor(lipa, 'open'), live(1800, 1260), NOW)   // ratio 1.43
    expect(t).toMatchObject({ level: 'moderate', source: 'live', minLo: 65, minHi: 80, fetchedAt: NOW })
  })

  it('without live traffic an open route is an estimate from route reports', () => {
    const cs = corridorStateFor(lipa, 'open')
    expect(trafficFor(lipa, cs, null, NOW)).toMatchObject({ level: 'light', source: 'estimate', minLo: cs.minLo, minHi: cs.minHi })
  })

  it('stale live traffic is not used', () => {
    expect(trafficFor(lipa, corridorStateFor(lipa, 'open'), live(2600, 1260, NOW - LIVE_FRESH_MS - 1), NOW).source).toBe('estimate')
  })

  it('a route reported slow is never shown better than the report', () => {
    const cs = corridorStateFor(lipa, 'slow')
    expect(trafficFor(lipa, cs, live(1300, 1260), NOW)).toMatchObject({ level: 'heavy', source: 'estimate', minLo: cs.minLo })
    expect(trafficFor(lipa, cs, live(2600, 1260), NOW)).toMatchObject({ level: 'heavy', source: 'live' })
  })
})

describe('rain level', () => {
  it.each([[null, 'none'], [0, 'low'], [29, 'low'], [30, 'mid'], [59, 'mid'], [60, 'high'], [100, 'high']] as const)('%s%% → %s', (p, l) => expect(rainLevel(p)).toBe(l))
})

describe('departure options', () => {
  const hourly: HourForecast[] = [0, 1, 2].map((h, i) => ({ t: NOW + h * 3_600_000, rainPct: [80, 70, 10][i], code: 61, tempC: 27 }))

  it('offers now, +30 min, +1 h and +2 h with the rain chance of each hour', () => {
    const d = departureOptions(lipa, corridorStateFor(lipa, 'open'), NOW, hourly, null)
    expect(d.map((x) => x.offsetMin)).toEqual([0, 30, 60, 120])
    expect(d.map((x) => x.rainPct)).toEqual([80, 80, 70, 10])
  })

  it('recommends waiting out heavy rain when traffic is the same', () => {
    const d = departureOptions(lipa, corridorStateFor(lipa, 'open'), NOW, hourly, null)
    expect(d.filter((x) => x.best).map((x) => x.offsetMin)).toEqual([120])
  })

  it('uses Google\'s forecast for later departures when given, and marks carried-forward readings as estimates', () => {
    const d = departureOptions(lipa, corridorStateFor(lipa, 'open'), NOW, undefined, live(2700, 1260), { 60: live(1300, 1260) })
    expect(d[0].traffic).toMatchObject({ source: 'live', level: 'heavy' })
    expect(d[1].traffic.source).toBe('estimate')
    expect(d[2].traffic).toMatchObject({ source: 'live', level: 'light' })
    expect(d.find((x) => x.best)!.offsetMin).toBe(60)
  })

  it('never recommends leaving on a closed route', () => {
    const d = departureOptions(lipa, corridorStateFor(lipa, 'closed'), NOW, hourly, null)
    expect(d.some((x) => x.best)).toBe(false)
    expect(d.every((x) => x.traffic.level === 'closed')).toBe(true)
  })
})
