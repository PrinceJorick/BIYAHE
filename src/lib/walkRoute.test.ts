// Walking-route modes and failure handling, with the supplied Pablo Borbon and Alangilan coordinates.
import { describe, expect, it, vi } from 'vitest'
import type { LatLng } from '../types'
import {
  estimateWalk, fetchWalkRoute, MAX_SNAP_M, parseOsrmWalk, resolveWalkRoute, validCached, walkCacheKey, walkRouteUrl,
  walkSummary, WALK_ROUTE_VERSION, type CachedWalk,
} from './walkRoute'

const PB: LatLng = [13.75547, 121.05364]
const PB_GYM: LatLng = [13.753079262668649, 121.05277271784234]
const AL: LatLng = [13.7842, 121.0744]
const LOUNGE: LatLng = [13.78393267903075, 121.07417575704717]

// OSRM-shaped answer: [lng, lat] positions, snapped a few metres from the requested points.
const osrm = (coords: number[][], code = 'Ok') => ({ code, routes: [{ distance: 470, geometry: { type: 'LineString', coordinates: coords } }] })
const PB_LINE = [[121.05362, 13.75545], [121.0533, 13.7545], [121.0529, 13.7537], [121.05278, 13.75310]]

const memCache = () => {
  const m = new Map<string, unknown>()
  return { m, get: async (k: string) => m.get(k), set: async (k: string, v: CachedWalk) => void m.set(k, v) }
}

describe('request building', () => {
  it('puts longitude first in the OSRM path', () => {
    expect(walkRouteUrl('https://r.example', PB, PB_GYM)).toBe(
      'https://r.example/route/v1/foot/121.05364,13.75547;121.05277271784234,13.753079262668649?overview=full&geometries=geojson&steps=false&alternatives=false',
    )
  })

  it('keys the cache by version and both exact points', () => {
    expect(walkCacheKey(AL, LOUNGE)).toBe(`walk:v${WALK_ROUTE_VERSION}:121.0744,13.7842;121.07417575704717,13.78393267903075`)
  })
})

describe('parseOsrmWalk', () => {
  it('converts [lng, lat] to [lat, lng] and runs from the requested origin to the spot', () => {
    const r = parseOsrmWalk(osrm(PB_LINE), PB, PB_GYM)
    if ('error' in r) throw new Error(r.error)
    expect(r.path[0]).toEqual(PB)
    expect(r.path.at(-1)).toEqual(PB_GYM)
    expect(r.path[1]).toEqual([13.75545, 121.05362])
    expect(r.distanceM).toBeGreaterThan(250)
    expect(r.distanceM).toBeLessThan(600)
  })

  it.each([
    ['a non-Ok code', osrm(PB_LINE, 'NoRoute'), /NoRoute/],
    ['no geometry', { code: 'Ok', routes: [{}] }, /geometry/],
    ['a single point', osrm([[121.0536, 13.7554]]), /geometry/],
    ['malformed positions', osrm([[121.05], [121.0529]]), /malformed/],
    ['out-of-range positions', osrm([[500, 13.75], [121.0529, 13.7531]]), /range/],
    ['swapped order ([lat, lng] sent back)', osrm(PB_LINE.map(([a, b]) => [b, a])), /range|from the requested/],
    ['ends far from the spot', osrm([[121.05362, 13.75545], [121.0600, 13.7600]]), /from the requested point/],
    ['nothing at all', null, /nothing/],
  ])('rejects %s', (_label, json, msg) => {
    const r = parseOsrmWalk(json, PB, PB_GYM)
    expect('error' in r && r.error).toMatch(msg)
  })

  it('rejects an implausible detour', () => {
    const loop = [[121.05362, 13.75545], [121.09, 13.80], [121.05278, 13.7531]]
    expect(parseOsrmWalk(osrm(loop), PB, PB_GYM)).toEqual({ error: 'implausibly long detour' })
  })

  it(`allows snapping up to ${MAX_SNAP_M} m (OSRM starts on the nearest path)`, () => {
    // ~30 m off at each end, as the real router returns for Malvar.
    const r = parseOsrmWalk(osrm([[121.15665, 14.0449], [121.1560, 14.0446]]), [14.0449, 121.1569], [14.044572113490197, 121.15574880496467])
    expect('path' in r).toBe(true)
  })
})

describe('fetchWalkRoute', () => {
  it('times out instead of hanging', async () => {
    vi.useFakeTimers()
    const never = (_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))))
    const p = fetchWalkRoute(PB, PB_GYM, { base: 'https://r.example', fetchImpl: never as typeof fetch, timeoutMs: 6000 })
    const check = expect(p).rejects.toThrow('no answer within 6 s')
    await vi.advanceTimersByTimeAsync(6000)
    await check
    vi.useRealTimers()
  })

  it('reports HTTP errors (rate limit, server down)', async () => {
    const f = (async () => new Response('busy', { status: 429 })) as typeof fetch
    await expect(fetchWalkRoute(PB, PB_GYM, { base: 'https://r.example', fetchImpl: f })).rejects.toThrow('router HTTP 429')
  })

  it('reports network / CORS failures', async () => {
    const f = (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch
    await expect(fetchWalkRoute(PB, PB_GYM, { base: 'https://r.example', fetchImpl: f })).rejects.toThrow('Failed to fetch')
  })

  it('is off when no router is configured', async () => {
    await expect(fetchWalkRoute(PB, PB_GYM, { base: '' })).rejects.toThrow('turned off')
  })
})

describe('resolveWalkRoute', () => {
  const live = async () => ({ path: [PB, [13.754, 121.053], PB_GYM] as LatLng[], distanceM: 470 })
  const fail = async () => { throw new Error('router HTTP 503') }

  it('live: returns the route, its minutes from distance, and saves it', async () => {
    const c = memCache()
    const r = await resolveWalkRoute('pb-gym', PB, PB_GYM, { allowNetwork: true, cacheGet: c.get, cacheSet: c.set, fetchRoute: live, now: () => 1000 })
    expect(r).toMatchObject({ mode: 'live', distanceM: 470, minutes: 7, fetchedAt: 1000, reason: null })
    expect(validCached(c.m.get(walkCacheKey(PB, PB_GYM)), PB, PB_GYM)).toBe(true)
  })

  it('cached: a failed request falls back to the saved route and says why', async () => {
    const c = memCache()
    await resolveWalkRoute('pb-gym', PB, PB_GYM, { allowNetwork: true, cacheGet: c.get, cacheSet: c.set, fetchRoute: live, now: () => 1000 })
    const r = await resolveWalkRoute('pb-gym', PB, PB_GYM, { allowNetwork: true, cacheGet: c.get, cacheSet: c.set, fetchRoute: fail })
    expect(r).toMatchObject({ mode: 'cached', fetchedAt: 1000, reason: 'router HTTP 503' })
    expect(r.path).toHaveLength(3)
  })

  it('cached without touching the network when offline / Low-Battery Mode', async () => {
    const c = memCache()
    await resolveWalkRoute('pb-gym', PB, PB_GYM, { allowNetwork: true, cacheGet: c.get, cacheSet: c.set, fetchRoute: live })
    const spy = vi.fn(live)
    const r = await resolveWalkRoute('pb-gym', PB, PB_GYM, { allowNetwork: false, cacheGet: c.get, cacheSet: c.set, fetchRoute: spy })
    expect(r.mode).toBe('cached')
    expect(spy).not.toHaveBeenCalled()
  })

  it('estimate: no route and nothing saved gives a straight-line estimate with no path', async () => {
    const c = memCache()
    const r = await resolveWalkRoute('pb-gym', PB, PB_GYM, { allowNetwork: true, cacheGet: c.get, cacheSet: c.set, fetchRoute: fail })
    expect(r).toMatchObject({ mode: 'estimate', path: null, minutes: 4, reason: 'router HTTP 503' })
    expect(r.distanceM).toBeGreaterThan(270)
    expect(r.distanceM).toBeLessThan(295)
  })

  it('ignores a cached route for other points or an older version', async () => {
    const c = memCache()
    const key = walkCacheKey(PB, PB_GYM)
    c.m.set(key, { v: WALK_ROUTE_VERSION - 1, from: PB, to: PB_GYM, path: [PB, PB_GYM], distanceM: 1, fetchedAt: 1 })
    expect((await resolveWalkRoute('pb-gym', PB, PB_GYM, { allowNetwork: false, cacheGet: c.get, cacheSet: c.set })).mode).toBe('estimate')
    c.m.set(key, { v: WALK_ROUTE_VERSION, from: PB, to: [13.75454, 121.05258], path: [PB, PB_GYM], distanceM: 1, fetchedAt: 1 })
    expect((await resolveWalkRoute('pb-gym', PB, PB_GYM, { allowNetwork: false, cacheGet: c.get, cacheSet: c.set })).mode).toBe('estimate')
  })

  it('survives a broken cache and a failing cache write', async () => {
    const r = await resolveWalkRoute('pb-gym', PB, PB_GYM, {
      allowNetwork: true, fetchRoute: live,
      cacheGet: async () => { throw new Error('idb') }, cacheSet: async () => { throw new Error('quota') },
    })
    expect(r.mode).toBe('live')
    const e = await resolveWalkRoute('pb-gym', PB, PB_GYM, { allowNetwork: false, cacheGet: async () => { throw new Error('idb') }, cacheSet: async () => {} })
    expect(e.mode).toBe('estimate')
  })

  it('unavailable for invalid coordinates', async () => {
    const r = await resolveWalkRoute('x', [Number.NaN, 0], PB_GYM, { allowNetwork: true, cacheGet: async () => undefined, cacheSet: async () => {} })
    expect(r.mode).toBe('unavailable')
  })

  it('is deterministic: the same inputs always give the same estimate', () => {
    expect(estimateWalk('lounge', AL, LOUNGE, null)).toEqual(estimateWalk('lounge', AL, LOUNGE, null))
  })
})

describe('walkSummary', () => {
  it('names how the figure was worked out', () => {
    expect(walkSummary(estimateWalk('pb-gym', PB, PB_GYM, null))).toBe('about 4 min walk · 280 m in a straight line (estimate)')
    expect(walkSummary({ mode: 'live', spotId: 'x', path: [], distanceM: 472, minutes: 7, fetchedAt: 1, reason: null })).toBe('about 7 min walk · 470 m along mapped paths')
    expect(walkSummary({ mode: 'unavailable', spotId: 'x', path: null, distanceM: null, minutes: null, fetchedAt: null, reason: null })).toBe('Walking time unavailable')
  })
})
