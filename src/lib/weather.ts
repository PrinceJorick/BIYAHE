// Open-Meteo (no key): current conditions at the campus point plus the next hours' chance of rain, used by the
// Home weather card and the map's "When should I leave?" options.
import { CAMPUS, type Weather } from '../data'
import type { HourForecast } from '../types'

const HOURS = 8
export const weatherUrl = ([lat, lng]: readonly [number, number]) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
  '&current=temperature_2m,precipitation,weather_code,wind_speed_10m,is_day' +
  `&hourly=precipitation_probability,weather_code,temperature_2m&forecast_hours=${HOURS}&timezone=Asia%2FManila`

// WMO weather interpretation codes, grouped to the wording a commuter needs.
export function weatherLabel(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code <= 48) return 'Fog'
  if (code <= 57) return 'Drizzle'
  if (code === 61 || code === 80) return 'Light rain'
  if (code === 63 || code === 81) return 'Moderate rain'
  if (code <= 67 || code === 82) return 'Heavy rain'
  if (code <= 77) return 'Sleet'
  if (code <= 86) return 'Rain showers'
  return 'Thunderstorm'
}

/** Rough sky group for picking an icon. */
export type Sky = 'clear' | 'cloud' | 'fog' | 'rain' | 'storm'
export function skyOf(code: number | undefined, precipMm = 0): Sky {
  if (code == null) return precipMm > 0 ? 'rain' : 'cloud'
  if (code >= 95) return 'storm'
  if (code >= 51) return 'rain'
  if (code >= 45) return 'fog'
  if (code >= 2) return 'cloud'
  return 'clear'
}

// Open-Meteo returns local wall-clock times ("2026-11-19T18:00") plus the zone's offset in seconds.
const localToEpoch = (local: string, offsetS: number) => Date.parse(`${local}:00Z`) - offsetS * 1000

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Validates an Open-Meteo forecast response. Throws on a malformed current block; drops malformed hours. */
export function parseOpenMeteo(json: unknown, now = Date.now()): Weather {
  const d = json as {
    utc_offset_seconds?: number
    current?: { temperature_2m?: number; precipitation?: number; weather_code?: number; wind_speed_10m?: number; is_day?: number }
    hourly?: { time?: string[]; precipitation_probability?: (number | null)[]; weather_code?: number[]; temperature_2m?: number[] }
  }
  const c = d?.current
  if (!c || !finite(c.temperature_2m) || !finite(c.weather_code)) throw new Error('Open-Meteo: no current conditions')
  const offset = finite(d.utc_offset_seconds) ? d.utc_offset_seconds : 8 * 3600
  const h = d.hourly
  const hourStart = now - (now % 3_600_000)
  const hourly: HourForecast[] = []
  for (let i = 0; i < (h?.time?.length ?? 0); i++) {
    const t = localToEpoch(h!.time![i], offset)
    const code = h!.weather_code?.[i]
    const temp = h!.temperature_2m?.[i]
    if (!Number.isFinite(t) || t < hourStart || !finite(code) || !finite(temp)) continue
    const p = h!.precipitation_probability?.[i]
    hourly.push({ t, rainPct: finite(p) ? Math.max(0, Math.min(100, Math.round(p))) : null, code, tempC: Math.round(temp) })
  }
  return {
    tempC: Math.round(c.temperature_2m),
    precipMm: finite(c.precipitation) ? c.precipitation : 0,
    windKph: finite(c.wind_speed_10m) ? Math.round(c.wind_speed_10m) : 0,
    label: weatherLabel(c.weather_code),
    code: c.weather_code,
    isDay: c.is_day !== 0,
    fetchedAt: now,
    live: true,
    hourly,
  }
}

export async function fetchWeather(): Promise<Weather> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 10_000)
  try {
    const res = await fetch(weatherUrl(CAMPUS), { signal: ctl.signal })
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
    return parseOpenMeteo(await res.json())
  } finally {
    clearTimeout(timer)
  }
}

/** The forecast hour that contains `t` (or null when the forecast does not reach that far). */
export const hourAt = (hourly: readonly HourForecast[] | undefined, t: number) =>
  hourly?.find((h) => t >= h.t && t < h.t + 3_600_000) ?? null
