import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearApiCache, latestEntry } from './apiCache'
import { cachedGoogleRoute, decodePolyline, fetchGoogleRoute, routeCacheKey, ROUTES_COOLDOWN_MS, ROUTES_TTL_MS, parseComputeRoutes, ROUTES_FIELD_MASK, ROUTES_URL, routesRequestBody } from './googleRoutes'

// Google's documented example: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" → (38.5,-120.2), (40.7,-120.95), (43.252,-126.453)
const EXAMPLE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'

describe('decodePolyline', () => {
  it('decodes Google\'s documented example', () => {
    expect(decodePolyline(EXAMPLE)).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]])
  })
  it('throws on a truncated string and returns nothing for an empty one', () => {
    expect(() => decodePolyline('_p~iF~ps|U_')).toThrow(/truncated/)
    expect(decodePolyline('')).toEqual([])
  })
})

describe('request body', () => {
  it('asks for a traffic-aware drive between two points', () => {
    expect(routesRequestBody([13.7842, 121.0744], [13.9554, 121.1606])).toEqual({
      origin: { location: { latLng: { latitude: 13.7842, longitude: 121.0744 } } },
      destination: { location: { latLng: { latitude: 13.9554, longitude: 121.1606 } } },
      travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', languageCode: 'en-PH', regionCode: 'PH', units: 'METRIC',
    })
  })
  it('adds a departure time for forecasts, and no routing preference for walking', () => {
    const t = Date.parse('2026-11-19T11:00:00Z')
    expect(routesRequestBody([13, 121], [14, 121], { departureTime: t }).departureTime).toBe('2026-11-19T11:00:00.000Z')
    expect(routesRequestBody([13, 121], [14, 121], { mode: 'WALK' })).not.toHaveProperty('routingPreference')
  })
})

describe('parseComputeRoutes', () => {
  it('reads durations, distance and geometry', () => {
    const r = parseComputeRoutes({ routes: [{ duration: '1500s', staticDuration: '1200s', distanceMeters: 25500, polyline: { encodedPolyline: EXAMPLE } }] })
    expect(r).toEqual({ durationS: 1500, staticS: 1200, distanceM: 25500, path: [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]] })
  })
  it('falls back to the traffic duration when no static one is given, and drops bad geometry', () => {
    expect(parseComputeRoutes({ routes: [{ duration: '600s', polyline: { encodedPolyline: '_p~' } }] })).toEqual({ durationS: 600, staticS: 600, distanceM: 0, path: null })
  })
  it('reports errors and empty answers', () => {
    expect(parseComputeRoutes({})).toEqual({ error: 'no route found' })
    expect(parseComputeRoutes({ routes: [{}] })).toEqual({ error: 'route has no duration' })
    expect(parseComputeRoutes({ error: { message: 'API key not valid' } })).toEqual({ error: 'API key not valid' })
  })
})

describe('fetchGoogleRoute', () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

  it('posts to the Routes API with the key and field mask', async () => {
    const f = ok({ routes: [{ duration: '90s', staticDuration: '60s', distanceMeters: 800 }] })
    const r = await fetchGoogleRoute([13.78, 121.07], [13.79, 121.08], { key: 'K', fetchImpl: f, now: () => 5 })
    expect(r).toEqual({ durationS: 90, staticS: 60, distanceM: 800, path: null, fetchedAt: 5 })
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(ROUTES_URL)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'X-Goog-Api-Key': 'K', 'X-Goog-FieldMask': ROUTES_FIELD_MASK })
  })

  it('throws a readable reason: no key, HTTP error message, timeout', async () => {
    await expect(fetchGoogleRoute([13, 121], [14, 121], { key: '' })).rejects.toThrow(/no Google Maps key/)
    await expect(fetchGoogleRoute([13, 121], [14, 121], { key: 'K', fetchImpl: ok({ error: { message: 'Routes API has not been used in project' } }, 403) })).rejects.toThrow(/has not been used/)
    const hang = vi.fn((_u: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))))
    await expect(fetchGoogleRoute([13, 121], [14, 121], { key: 'K', fetchImpl: hang as unknown as typeof fetch, timeoutMs: 20 })).rejects.toThrow(/no answer within/)
  })
})

// ── Request optimisation (src/lib/apiCache.ts) ─────────────────────────────────

describe('cachedGoogleRoute: cache, dedupe, cooldown, quota fallback', () => {
  beforeEach(clearApiCache)
  afterEach(clearApiCache)
  const T0 = Date.parse('2026-11-20T08:00:00Z')
  const FROM: [number, number] = [13.7842, 121.0744]
  const TO: [number, number] = [13.94, 121.16]
  const LIPA = { campusId: 'alangilan', destinationId: 'lipa' }
  const ok = (secs: number) => new Response(JSON.stringify({ routes: [{ duration: `${secs}s`, staticDuration: '2400s', distanceMeters: 25000, polyline: { encodedPolyline: EXAMPLE } }] }))
  function routesMock() {
    const bodies: { departureTime?: string }[] = []
    let next = () => ok(2900)
    const f = (async (_u: string, init: RequestInit) => { bodies.push(JSON.parse(init.body as string)); return next() }) as unknown as typeof fetch
    return { f, bodies, respond: (r: () => Response) => { next = r } }
  }
  const call = (m: ReturnType<typeof routesMock>, t: number, extra: { manual?: boolean } = {}, r = LIPA) => cachedGoogleRoute(r, FROM, TO, { key: 'K', fetchImpl: m.f, now: () => t, ...extra })

  it('two simultaneous requests share the exact same Promise and make one request', async () => {
    const m = routesMock()
    const a = call(m, T0)
    const b = call(m, T0)
    expect(a).toBe(b)
    expect((await a).data.durationS).toBe(2900)
    expect(m.bodies).toHaveLength(1)
  })

  it('within 10 minutes the cached route is returned without a request', async () => {
    const m = routesMock()
    await call(m, T0)
    const r = await call(m, T0 + ROUTES_TTL_MS - 1)
    expect(m.bodies).toHaveLength(1)
    expect(r).toMatchObject({ source: 'cache', fetchedAt: T0 })
  })

  it('after 10 minutes a new request replaces the cached route', async () => {
    const m = routesMock()
    await call(m, T0)
    m.respond(() => ok(3300))
    const t1 = T0 + ROUTES_TTL_MS + 1
    const r = await call(m, t1)
    expect(m.bodies).toHaveLength(2)
    expect(r).toMatchObject({ source: 'network', fetchedAt: t1 })
    expect(r.data).toMatchObject({ durationS: 3300, fetchedAt: t1 })
    expect(latestEntry(routeCacheKey(LIPA), t1)!.fetchedAt).toBe(t1)
  })

  it('a manual refresh skips the TTL once per 30 s; concurrent manual refreshes share one request', async () => {
    const m = routesMock()
    await call(m, T0)
    await call(m, T0 + 5000, { manual: true })
    expect(m.bodies).toHaveLength(2)
    await call(m, T0 + 20_000, { manual: true })
    expect(m.bodies).toHaveLength(2)
    const t = T0 + 5000 + ROUTES_COOLDOWN_MS
    const a = call(m, t, { manual: true })
    expect(call(m, t, { manual: true })).toBe(a)
    await a
    expect(m.bodies).toHaveLength(3)
  })

  it.each([429, 403])('HTTP %i: no retry, the last good route as stale with its original time, cache untouched', async (status) => {
    const m = routesMock()
    await call(m, T0)
    m.respond(() => new Response(JSON.stringify({ error: { message: 'quota' } }), { status }))
    const t1 = T0 + ROUTES_TTL_MS + 1
    const r = await call(m, t1)
    expect(m.bodies).toHaveLength(2)
    expect(r).toMatchObject({ source: 'stale', fetchedAt: T0 })
    expect(r.data.fetchedAt).toBe(T0)
    expect(latestEntry(routeCacheKey(LIPA), t1)!.fetchedAt).toBe(T0)
    // nothing cached for another route: it rejects (the app keeps its estimate) and leaves nothing in flight
    await expect(call(m, t1, {}, { campusId: 'alangilan', destinationId: 'tanauan' })).rejects.toThrow(/quota/)
    await call(m, t1 + 1, {}, { campusId: 'alangilan', destinationId: 'tanauan' }).catch(() => {})
    expect(m.bodies).toHaveLength(4)
  })

  it('destinations, modes and departures never share an entry; walking routes are not cached', async () => {
    expect(routeCacheKey(LIPA)).toBe('routes:alangilan:lipa:DRIVE:now')
    expect(new Set([routeCacheKey(LIPA), routeCacheKey({ ...LIPA, destinationId: 'tanauan' }), routeCacheKey({ ...LIPA, mode: 'WALK' }), routeCacheKey({ ...LIPA, departInMin: 30 }), routeCacheKey({ ...LIPA, campusId: 'malvar' })]).size).toBe(5)
    const m = routesMock()
    await call(m, T0)
    const later = await cachedGoogleRoute({ ...LIPA, departInMin: 30 }, FROM, TO, { key: 'K', fetchImpl: m.f, now: () => T0 })
    expect(later.source).toBe('network')
    expect(m.bodies[1].departureTime).toBe(new Date(T0 + 30 * 60_000).toISOString())
    await cachedGoogleRoute({ ...LIPA, mode: 'WALK' }, FROM, TO, { key: 'K', fetchImpl: m.f, now: () => T0 })
    await cachedGoogleRoute({ ...LIPA, mode: 'WALK' }, FROM, TO, { key: 'K', fetchImpl: m.f, now: () => T0 })
    expect(m.bodies).toHaveLength(4)
  })
})
