import { describe, expect, it } from 'vitest'
import { hourAt, parseOpenMeteo, skyOf, weatherLabel, weatherUrl } from './weather'

// 2026-11-19 18:10 in Manila (UTC+8) = 10:10 UTC.
const NOW = Date.parse('2026-11-19T10:10:00Z')
const sample = {
  utc_offset_seconds: 28800,
  current: { time: '2026-11-19T18:00', temperature_2m: 27.8, precipitation: 0.4, weather_code: 61, wind_speed_10m: 13.7, is_day: 0 },
  hourly: {
    time: ['2026-11-19T17:00', '2026-11-19T18:00', '2026-11-19T19:00', '2026-11-19T20:00', '2026-11-19T21:00'],
    precipitation_probability: [90, 55, null, 20, 101],
    weather_code: [63, 61, 3, 2, 'x'],
    temperature_2m: [28.1, 27.6, 27.2, 26.9, 26.5],
  },
}

describe('Open-Meteo parsing', () => {
  it('reads current conditions', () => {
    const w = parseOpenMeteo(sample, NOW)
    expect(w).toMatchObject({ tempC: 28, precipMm: 0.4, windKph: 14, label: 'Light rain', code: 61, isDay: false, live: true, fetchedAt: NOW })
  })

  it('keeps hours from the current one on, as epoch times in Manila time, and drops malformed hours', () => {
    const w = parseOpenMeteo(sample, NOW)
    expect(w.hourly!.map((h) => new Date(h.t).toISOString())).toEqual(['2026-11-19T10:00:00.000Z', '2026-11-19T11:00:00.000Z', '2026-11-19T12:00:00.000Z'])
    expect(w.hourly!.map((h) => h.rainPct)).toEqual([55, null, 20])
  })

  it('refuses a response without current conditions', () => {
    expect(() => parseOpenMeteo({}, NOW)).toThrow(/no current conditions/)
    expect(() => parseOpenMeteo({ current: { temperature_2m: 'hot' } }, NOW)).toThrow()
  })

  it('finds the forecast hour containing a time', () => {
    const w = parseOpenMeteo(sample, NOW)
    expect(hourAt(w.hourly, NOW)?.rainPct).toBe(55)
    expect(hourAt(w.hourly, NOW + 3_600_000)?.rainPct).toBeNull()
    expect(hourAt(w.hourly, NOW + 10 * 3_600_000)).toBeNull()
    expect(hourAt(undefined, NOW)).toBeNull()
  })

  it('asks for the campus point with hourly rain chance, in Manila time', () => {
    const u = weatherUrl([13.7842, 121.0744])
    expect(u).toContain('latitude=13.7842&longitude=121.0744')
    expect(u).toContain('hourly=precipitation_probability')
    expect(u).toContain('timezone=Asia%2FManila')
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
