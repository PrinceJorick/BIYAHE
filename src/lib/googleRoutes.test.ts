import { describe, expect, it, vi } from 'vitest'
import { decodePolyline, fetchGoogleRoute, parseComputeRoutes, ROUTES_FIELD_MASK, ROUTES_URL, routesRequestBody } from './googleRoutes'

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
