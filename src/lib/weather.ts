// Client side of /api/weather (api/weather.ts, Google Weather API): current conditions at the campus point, the
// next hours' chance of rain (Home weather card, the map's "When should I leave?") and public weather alerts from
// PAGASA. Conditions and forecasts are estimates; only alerts carry their issuing authority.
import type { CampusId, HourForecast, Weather, WeatherAlert } from '../types'

// WMO-style codes (api/weather.ts maps Google's condition types onto them), grouped to the wording a commuter needs.
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

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

function readAlert(x: unknown): WeatherAlert | null {
  const a = x as Partial<WeatherAlert> | null
  if (!a || !str(a.id) || !str(a.title) || !str(a.authority)) return null
  return {
    id: a.id!, title: a.title!, authority: a.authority!, description: str(a.description),
    authorityUrl: typeof a.authorityUrl === 'string' && a.authorityUrl.startsWith('https://') ? a.authorityUrl : null,
    severity: str(a.severity) || 'UNKNOWN', urgency: str(a.urgency) || 'UNKNOWN', areaName: str(a.areaName),
    instructions: Array.isArray(a.instructions) ? a.instructions.filter((i): i is string => typeof i === 'string') : [],
    startAt: finite(a.startAt) ? a.startAt : null, expiresAt: finite(a.expiresAt) ? a.expiresAt : null,
  }
}

/** Validates an /api/weather answer. Throws when it has no current conditions; drops malformed hours and alerts. */
export function parseWeatherPayload(json: unknown, now = Date.now()): Weather {
  const d = json as {
    provider?: unknown; error?: unknown; fetchedAt?: unknown
    current?: { observedAt?: unknown; tempC?: unknown; feelsLikeC?: unknown; label?: unknown; code?: unknown; isDay?: unknown; rainPct?: unknown; thunderPct?: unknown; precipMm?: unknown; windKph?: unknown }
    hourly?: unknown[]; alerts?: unknown[]
  } | null
  if (d?.provider === 'none') throw new Error('Weather is not configured on the server')
  const c = d?.current
  if (!c || !finite(c.tempC) || !finite(c.code) || typeof c.label !== 'string') throw new Error(typeof d?.error === 'string' ? d.error : 'Google Weather: no current conditions')
  const hourStart = now - (now % 3_600_000)
  const hourly: HourForecast[] = (Array.isArray(d!.hourly) ? d!.hourly : [])
    .map((h) => h as Partial<HourForecast>)
    .filter((h): h is HourForecast => finite(h?.t) && finite(h.code) && finite(h.tempC) && (h.rainPct === null || finite(h.rainPct)) && h.t >= hourStart)
    .map((h) => ({ t: h.t, rainPct: h.rainPct == null ? null : Math.max(0, Math.min(100, Math.round(h.rainPct))), code: h.code, tempC: Math.round(h.tempC) }))
  return {
    tempC: Math.round(c.tempC),
    precipMm: finite(c.precipMm) ? c.precipMm : 0,
    windKph: finite(c.windKph) ? Math.round(c.windKph) : 0,
    label: c.label,
    code: c.code,
    isDay: c.isDay !== false,
    observedAt: finite(c.observedAt) ? c.observedAt : now,
    fetchedAt: finite(d!.fetchedAt) ? d!.fetchedAt : now,
    live: true,
    source: 'google',
    rainPct: finite(c.rainPct) ? c.rainPct : null,
    thunderPct: finite(c.thunderPct) ? c.thunderPct : null,
    feelsLikeC: finite(c.feelsLikeC) ? c.feelsLikeC : null,
    hourly,
    ...(Array.isArray(d!.alerts) ? { alerts: d!.alerts.map(readAlert).filter((a): a is WeatherAlert => a !== null) } : {}),
  }
}

export const weatherUrl = (campus: CampusId) => `/api/weather?campus=${encodeURIComponent(campus)}`

export async function fetchWeather(campus: CampusId, fetchImpl: typeof fetch = fetch): Promise<Weather> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 12_000)
  try {
    const res = await fetchImpl(weatherUrl(campus), { signal: ctl.signal })
    if (!res.ok) throw new Error(`weather HTTP ${res.status}`)
    return parseWeatherPayload(await res.json())
  } finally {
    clearTimeout(timer)
  }
}

/** Alerts that are in force at `now` (no start yet counts as started; no expiry counts as current). */
export const currentAlerts = (alerts: readonly WeatherAlert[] | undefined, now: number) =>
  (alerts ?? []).filter((a) => (a.startAt == null || a.startAt <= now) && (a.expiresAt == null || a.expiresAt > now))

/** The forecast hour that contains `t` (or null when the forecast does not reach that far). */
export const hourAt = (hourly: readonly HourForecast[] | undefined, t: number) =>
  hourly?.find((h) => t >= h.t && t < h.t + 3_600_000) ?? null
