import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAMPUS_POINTS, codeOf, getWeather, handleWeather, parseAlerts, parseCurrent, parseHours, weatherKey } from '../../api/weather'
import { campuses, CAMPUS_IDS } from '../campuses'
import { clearApiCache, HttpError, isQuotaError, latestEntry } from './apiCache'
import { currentAlerts, fetchWeather, hourAt, parseWeatherPayload, skyOf, weatherCacheKey, weatherLabel, WEATHER_COOLDOWN_MS, WEATHER_TTL_MS } from './weather'

const NOW = Date.parse('2026-11-20T08:40:00Z')

// Shapes as returned by weather.googleapis.com (trimmed from a real response, 2026-11-20).
const current = {
  currentTime: '2026-11-20T08:38:57.609962033Z', isDaytime: true, relativeHumidity: 74, thunderstormProbability: 30,
  weatherCondition: { description: { text: 'Light rain', languageCode: 'en' }, type: 'LIGHT_RAIN' },
  temperature: { unit: 'CELSIUS', degrees: 28.1 }, feelsLikeTemperature: { unit: 'CELSIUS', degrees: 32.5 },
  precipitation: { probability: { type: 'RAIN', percent: 65 }, qpf: { unit: 'MILLIMETERS', quantity: 0.27 } },
  wind: { speed: { unit: 'KILOMETERS_PER_HOUR', value: 10 }, gust: { unit: 'KILOMETERS_PER_HOUR', value: 27 } },
}
const hour = (h: number, type: string, pct: number) => ({
  interval: { startTime: `2026-11-20T${String(h).padStart(2, '0')}:00:00Z` }, weatherCondition: { type },
  temperature: { unit: 'CELSIUS', degrees: 28.6 }, precipitation: { probability: { percent: pct } },
})
const hours = { forecastHours: [hour(9, 'RAIN', 80), hour(8, 'CLOUDY', 20), { interval: {} }] }
const alerts = {
  weatherAlerts: [{
    alertId: 'pagasa-1', alertTitle: { text: 'Heavy Rainfall Warning (Orange)' }, eventType: 'HEAVY_RAIN', areaName: 'Batangas',
    description: 'Heavy rainfall observed.', severity: 'SEVERE', urgency: 'IMMEDIATE', instruction: ['Avoid low-lying areas.'],
    startTime: '2026-11-20T07:00:00Z', expirationTime: '2026-11-20T10:00:00Z',
    dataSource: { publisher: 'PAGASA', name: 'Philippine Atmospheric, Geophysical and Astronomical Services Administration', authorityUri: 'https://www.pagasa.dost.gov.ph/' },
  }, { alertTitle: { text: 'No authority' } }],
}

describe('Google Weather parsing (server)', () => {
  it('reads current conditions with units and times', () => {
    expect(parseCurrent(current)).toMatchObject({
      observedAt: Date.parse('2026-11-20T08:38:57.609Z'), tempC: 28, feelsLikeC: 33, label: 'Light rain', code: 61, conditionType: 'LIGHT_RAIN',
      isDay: true, rainPct: 65, thunderPct: 30, precipMm: 0.3, windKph: 10, gustKph: 27, humidityPct: 74,
    })
  })

  it('converts Fahrenheit and mph, and refuses a response without conditions', () => {
    const f = parseCurrent({ ...current, temperature: { unit: 'FAHRENHEIT', degrees: 86 }, wind: { speed: { unit: 'MILES_PER_HOUR', value: 10 } } })
    expect(f!.tempC).toBe(30)
    expect(f!.windKph).toBe(16)
    expect(() => parseCurrent({})).toThrow(/no current conditions/)
    expect(() => parseCurrent({ ...current, currentTime: 'nope' })).toThrow()
  })

  it('reads hourly forecasts in time order and drops malformed hours', () => {
    const h = parseHours(hours)
    expect(h.map((x) => [new Date(x.t).toISOString(), x.rainPct, x.code])).toEqual([['2026-11-20T08:00:00.000Z', 20, 3], ['2026-11-20T09:00:00.000Z', 80, 63]])
    expect(parseHours(null)).toEqual([])
  })

  it('keeps the issuing authority, times and https source link of public alerts', () => {
    const [a, ...rest] = parseAlerts(alerts)
    expect(rest).toEqual([])
    expect(a).toMatchObject({
      id: 'pagasa-1', title: 'Heavy Rainfall Warning (Orange)', authorityUrl: 'https://www.pagasa.dost.gov.ph/', severity: 'SEVERE', areaName: 'Batangas',
      instructions: ['Avoid low-lying areas.'], startAt: Date.parse('2026-11-20T07:00:00Z'), expiresAt: Date.parse('2026-11-20T10:00:00Z'),
    })
    expect(a.authority).toMatch(/Philippine Atmospheric/)
    expect(parseAlerts({ weatherAlerts: [] })).toEqual([])
  })

  it.each([['CLEAR', 0], ['PARTLY_CLOUDY', 2], ['CLOUDY', 3], ['LIGHT_RAIN_SHOWERS', 61], ['RAIN', 63], ['HEAVY_RAIN', 65], ['SCATTERED_THUNDERSTORMS', 95], ['WINDY', 3]])('%s → code %i', (t, c) => expect(codeOf(t)).toBe(c))

  it('only knows the three campus points, and they match the campus registry', () => {
    expect(Object.keys(CAMPUS_POINTS).sort()).toEqual([...CAMPUS_IDS].sort())
    for (const id of CAMPUS_IDS) expect(CAMPUS_POINTS[id]).toEqual(campuses[id].location)
  })
})

describe('getWeather / handleWeather (server)', () => {
  afterEach(clearApiCache)
  const route = (map: Record<string, unknown>, status = 200) => (async (url: string) => {
    const key = Object.keys(map).find((k) => url.includes(k))
    return new Response(JSON.stringify(key ? map[key] : {}), { status })
  }) as unknown as typeof fetch

  it('without a key makes no request', async () => {
    expect(await getWeather('alangilan', {}, route({}), NOW)).toEqual({ provider: 'none', fetchedAt: NOW })
  })

  it('combines current, hourly and alerts; a failed alerts lookup is reported, not read as "no alerts"', async () => {
    const all = await getWeather('alangilan', { GOOGLE_WEATHER_API_KEY: 'k' }, route({ currentConditions: current, 'forecast/hours': hours, publicAlerts: alerts }), NOW)
    expect(all.current?.tempC).toBe(28)
    expect(all.hourly).toHaveLength(2)
    expect(all.alerts).toHaveLength(1)
    expect(all.error).toBeUndefined()
    const noAlerts = (async (url: string) => new Response(JSON.stringify(url.includes('publicAlerts') ? {} : url.includes('current') ? current : hours), { status: url.includes('publicAlerts') ? 500 : 200 })) as unknown as typeof fetch
    clearApiCache() // a fresh instance: the first answer above would otherwise be served from the cache
    const partial = await getWeather('alangilan', { WEATHER_API_KEY: 'k' }, noAlerts, NOW)
    expect(partial.alerts).toBeUndefined()
    expect(partial.error).toBe('Weather alerts unavailable')
  })

  it('reports quota exhaustion and outages without throwing', async () => {
    expect((await getWeather('malvar', { GOOGLE_WEATHER_API_KEY: 'k' }, route({}, 429), NOW)).error).toBe('Google Weather quota reached')
    expect((await getWeather('malvar', { GOOGLE_WEATHER_API_KEY: 'k' }, route({}, 503), NOW)).error).toBe('Google Weather HTTP 503')
  })

  it('refuses unknown campuses (no arbitrary coordinates) and never puts the key in the answer', async () => {
    expect((await handleWeather(new Request('http://x/api/weather?campus=manila'), { GOOGLE_WEATHER_API_KEY: 'k' }, route({}))).status).toBe(400)
    expect((await handleWeather(new Request('http://x/api/weather?campus=alangilan&lat=1'), { GOOGLE_WEATHER_API_KEY: 'secret-key' }, route({ currentConditions: current, 'forecast/hours': hours, publicAlerts: alerts }))).status).toBe(200)
    clearApiCache()
    const r = await handleWeather(new Request('http://x/api/weather?campus=alangilan'), { GOOGLE_WEATHER_API_KEY: 'secret-key' }, route({ currentConditions: current, 'forecast/hours': hours, publicAlerts: alerts }))
    expect(await r.text()).not.toContain('secret-key')
    expect(r.headers.get('cache-control')).toContain('s-maxage=1200')
  })
})

describe('weather on the device', () => {
  it('validates the /api/weather answer; forecasts are not alerts', async () => {
    const payload = await getWeather('alangilan', { GOOGLE_WEATHER_API_KEY: 'k' }, (async (url: string) => new Response(JSON.stringify(url.includes('publicAlerts') ? alerts : url.includes('current') ? current : hours))) as unknown as typeof fetch, NOW)
    const w = parseWeatherPayload(JSON.parse(JSON.stringify(payload)), NOW)
    expect(w).toMatchObject({ tempC: 28, label: 'Light rain', code: 61, source: 'google', live: true, rainPct: 65 })
    expect(w.hourly!.map((h) => h.rainPct)).toEqual([20, 80])
    expect(w.alerts).toHaveLength(1)
    expect(() => parseWeatherPayload({ provider: 'none', fetchedAt: 1 })).toThrow(/not configured/)
    expect(() => parseWeatherPayload({ provider: 'google', fetchedAt: 1, error: 'Google Weather quota reached' })).toThrow(/quota/)
  })

  it('lists only alerts in force', () => {
    const [a] = parseAlerts(alerts)
    expect(currentAlerts([a], NOW)).toHaveLength(1)
    expect(currentAlerts([a], Date.parse('2026-11-20T10:00:00Z'))).toHaveLength(0)
    expect(currentAlerts([a], Date.parse('2026-11-20T06:59:00Z'))).toHaveLength(0)
    expect(currentAlerts(undefined, NOW)).toEqual([])
  })

  it('finds the forecast hour containing a time', () => {
    const h = parseHours(hours)
    expect(hourAt(h, Date.parse('2026-11-20T08:30:00Z'))?.rainPct).toBe(20)
    expect(hourAt(h, Date.parse('2026-11-20T12:00:00Z'))).toBeNull()
    expect(hourAt(undefined, NOW)).toBeNull()
  })
})

describe('weather wording', () => {
  it.each([[0, 'Clear sky'], [2, 'Partly cloudy'], [45, 'Fog'], [63, 'Moderate rain'], [82, 'Heavy rain'], [95, 'Thunderstorm']])('%i → %s', (c, l) => expect(weatherLabel(c)).toBe(l))
  it('groups codes for the icon', () => {
    expect(skyOf(0)).toBe('clear')
    expect(skyOf(3)).toBe('cloud')
    expect(skyOf(61)).toBe('rain')
    expect(skyOf(96)).toBe('storm')
    expect(skyOf(undefined, 1.2)).toBe('rain')
  })
})

// ── Request optimisation (src/lib/apiCache.ts) ─────────────────────────────────

const MIN = 60_000
const T0 = Date.parse('2026-11-20T08:00:00Z')
// An /api/weather answer as the server sends it.
const payload = (fetchedAt: number, tempC = 28) => ({
  provider: 'google', fetchedAt,
  current: { observedAt: fetchedAt, tempC, feelsLikeC: 31, label: 'Sunny', code: 0, conditionType: 'CLEAR', isDay: true, rainPct: 10, thunderPct: 5, precipMm: 0, windKph: 9, gustKph: 20, humidityPct: 70 },
  hourly: [], alerts: [],
})
function apiMock() {
  const calls: string[] = []
  let next: () => Response = () => new Response(JSON.stringify(payload(T0)))
  const f = (async (url: string) => { calls.push(url); return next() }) as unknown as typeof fetch
  return { f, calls, respond: (r: () => Response) => { next = r } }
}

describe('weather requests: cache, dedupe, cooldown, quota fallback', () => {
  beforeEach(clearApiCache)
  afterEach(() => { clearApiCache(); vi.unstubAllGlobals() })

  it('two simultaneous calls share the exact same Promise and make one request', async () => {
    const m = apiMock()
    const a = fetchWeather('alangilan', { fetchImpl: m.f, now: () => T0 })
    const b = fetchWeather('alangilan', { fetchImpl: m.f, now: () => T0 })
    expect(a).toBe(b)
    await a
    expect(m.calls).toHaveLength(1)
  })

  it('a second call within 20 minutes is served from the cache (no request), with the original time', async () => {
    const m = apiMock()
    await fetchWeather('alangilan', { fetchImpl: m.f, now: () => T0 })
    const r = await fetchWeather('alangilan', { fetchImpl: m.f, now: () => T0 + WEATHER_TTL_MS - 1 })
    expect(m.calls).toHaveLength(1)
    expect(r.source).toBe('cache')
    expect(r.fetchedAt).toBe(T0)
  })

  it('after 20 minutes a new request replaces the entry and its time', async () => {
    const m = apiMock()
    await fetchWeather('alangilan', { fetchImpl: m.f, now: () => T0 })
    const t1 = T0 + WEATHER_TTL_MS + 1
    m.respond(() => new Response(JSON.stringify(payload(t1, 30))))
    const r = await fetchWeather('alangilan', { fetchImpl: m.f, now: () => t1 })
    expect(m.calls).toHaveLength(2)
    expect(r).toMatchObject({ source: 'network', fetchedAt: t1 })
    expect(r.data.tempC).toBe(30)
    expect(latestEntry(weatherCacheKey('alangilan'), t1)!.fetchedAt).toBe(t1)
  })

  it('a manual refresh skips the TTL once per 60 s; repeats wait; concurrent refreshes share one request', async () => {
    const m = apiMock()
    await fetchWeather('alangilan', { fetchImpl: m.f, now: () => T0 })
    await fetchWeather('alangilan', { fetchImpl: m.f, manual: true, now: () => T0 + MIN })
    expect(m.calls).toHaveLength(2)
    const again = await fetchWeather('alangilan', { fetchImpl: m.f, manual: true, now: () => T0 + MIN + 30_000 })
    expect(m.calls).toHaveLength(2)
    expect(again.source).toBe('cache')
    const t = T0 + MIN + WEATHER_COOLDOWN_MS
    const a = fetchWeather('alangilan', { fetchImpl: m.f, manual: true, now: () => t })
    const b = fetchWeather('alangilan', { fetchImpl: m.f, manual: true, now: () => t })
    expect(a).toBe(b)
    await a
    expect(m.calls).toHaveLength(3)
  })

  it.each([429, 403])('HTTP %i: one request, no retry, the last good answer as a saved copy with its original time', async (status) => {
    const m = apiMock()
    await fetchWeather('alangilan', { fetchImpl: m.f, now: () => T0 })
    m.respond(() => new Response('{}', { status }))
    const t1 = T0 + WEATHER_TTL_MS + 1
    const r = await fetchWeather('alangilan', { fetchImpl: m.f, now: () => t1 })
    expect(m.calls).toHaveLength(2)
    expect(r).toMatchObject({ source: 'stale', fetchedAt: T0 })
    expect(r.data.fetchedAt).toBe(T0)
    // the failure did not replace the good entry
    expect(latestEntry(weatherCacheKey('alangilan'), t1)!.fetchedAt).toBe(T0)
  })

  it('a quota answer from the server (200 with status 403) with nothing cached rejects as a quota error', async () => {
    const m = apiMock()
    m.respond(() => new Response(JSON.stringify({ provider: 'google', fetchedAt: T0, error: 'Google Weather HTTP 403', status: 403 })))
    const err = await fetchWeather('malvar', { fetchImpl: m.f, now: () => T0 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect(isQuotaError(err)).toBe(true)
    // the failed request left nothing in flight: a later call asks again
    await fetchWeather('malvar', { fetchImpl: m.f, now: () => T0 + 1 }).catch(() => {})
    expect(m.calls).toHaveLength(2)
  })

  it('campuses never share an entry, and keys round coordinates to 3 decimals', async () => {
    const m = apiMock()
    await fetchWeather('alangilan', { fetchImpl: m.f, now: () => T0 })
    await fetchWeather('malvar', { fetchImpl: m.f, now: () => T0 })
    expect(m.calls.map((u) => new URL(u, 'http://x').searchParams.get('campus'))).toEqual(['alangilan', 'malvar'])
    expect(weatherCacheKey('alangilan')).toBe('weather:alangilan:13.784,121.074:api-weather')
    expect(weatherKey('alangilan', [13.78421, 121.07438], 'publicAlerts')).toBe(weatherKey('alangilan', [13.7842, 121.0744], 'publicAlerts'))
    expect(weatherKey('alangilan', [13.7842, 121.0744], 'publicAlerts')).not.toBe(weatherKey('alangilan', [13.7842, 121.0744], 'currentConditions'))
  })

  it('uses localStorage when present, survives malformed entries, and falls back to memory when storage throws', async () => {
    const store = new Map<string, string>([[`biyahe-api:v1:${weatherCacheKey('alangilan')}`, '{not json']])
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), key: (i: number) => [...store.keys()][i] ?? null, get length() { return store.size } }
    vi.stubGlobal('window', { localStorage: ls })
    const m = apiMock()
    await fetchWeather('alangilan', { fetchImpl: m.f, now: () => T0 })
    expect(m.calls).toHaveLength(1)
    expect(JSON.parse(store.get(`biyahe-api:v1:${weatherCacheKey('alangilan')}`)!).fetchedAt).toBe(T0)
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') }, removeItem: () => { throw new Error('blocked') }, key: () => null, length: 0 }
    vi.stubGlobal('window', { localStorage: broken })
    clearApiCache()
    await fetchWeather('malvar', { fetchImpl: m.f, now: () => T0 })
    await fetchWeather('malvar', { fetchImpl: m.f, now: () => T0 + MIN })
    expect(m.calls).toHaveLength(2) // second read served from memory
  })
})

describe('server weather lookups (per Google endpoint)', () => {
  afterEach(clearApiCache)
  const google = () => {
    const calls: string[] = []
    let status = 200
    const f = (async (url: string) => {
      calls.push(url)
      if (status !== 200) return new Response('{}', { status })
      return new Response(JSON.stringify(url.includes('publicAlerts') ? alerts : url.includes('current') ? current : hours))
    }) as unknown as typeof fetch
    return { f, calls, fail: (s: number) => { status = s } }
  }

  it('caches each endpoint for 20 minutes: a second request makes no Google calls', async () => {
    const g = google()
    await getWeather('alangilan', { GOOGLE_WEATHER_API_KEY: 'k' }, g.f, T0)
    await getWeather('alangilan', { GOOGLE_WEATHER_API_KEY: 'k' }, g.f, T0 + 19 * MIN)
    expect(g.calls).toHaveLength(3)
  })

  it('on 403 after expiry: the last good answer, marked stale, with its original time; one call per endpoint', async () => {
    const g = google()
    await getWeather('alangilan', { GOOGLE_WEATHER_API_KEY: 'k' }, g.f, T0)
    g.fail(403)
    const r = await getWeather('alangilan', { GOOGLE_WEATHER_API_KEY: 'k' }, g.f, T0 + 21 * MIN)
    expect(g.calls).toHaveLength(6)
    expect(r).toMatchObject({ stale: true, fetchedAt: T0 })
    expect(r.current?.tempC).toBe(28)
    expect(parseWeatherPayload(JSON.parse(JSON.stringify(r)), T0).live).toBe(false)
  })
})
