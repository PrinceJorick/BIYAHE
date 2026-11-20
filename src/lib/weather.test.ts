import { afterEach, describe, expect, it } from 'vitest'
import { CAMPUS_POINTS, codeOf, getWeather, handleWeather, parseAlerts, parseCurrent, parseHours, resetWeatherMemo } from '../../api/weather'
import { campuses, CAMPUS_IDS } from '../campuses'
import { currentAlerts, hourAt, parseWeatherPayload, skyOf, weatherLabel } from './weather'

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
  afterEach(resetWeatherMemo)
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
    resetWeatherMemo()
    const r = await handleWeather(new Request('http://x/api/weather?campus=alangilan'), { GOOGLE_WEATHER_API_KEY: 'secret-key' }, route({ currentConditions: current, 'forecast/hours': hours, publicAlerts: alerts }))
    expect(await r.text()).not.toContain('secret-key')
    expect(r.headers.get('cache-control')).toContain('s-maxage=1800')
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
