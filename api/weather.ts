// GET /api/weather?campus=<id>: current conditions, the next hours and public weather alerts at a campus.
//
// Provider: Google Maps Platform Weather API (https://weather.googleapis.com), called server-side with the
// server-only GOOGLE_WEATHER_API_KEY (WEATHER_API_KEY is read as a fallback name). Only the three campus points
// below can be asked for, so the endpoint cannot be used to spend the quota on arbitrary places.
//
// Provenance: conditions and forecasts are model output (shown as Estimate). Public alerts come from the issuing
// authority (PAGASA for the Philippines) and are passed on with that authority's name, times and link.
//
// Billing: every lookup is a billable Weather API event (a monthly free allowance, then paid). One refresh costs
// 3 lookups; the answer is cached at the edge for 30 minutes and in this instance's memory for 15 minutes.
//
// Self-contained (no imports) so Vercel can build it as-is; the pure helpers are unit-tested in
// src/lib/weather.test.ts, which also checks that these coordinates match src/campuses.

export type HourForecast = { t: number; rainPct: number | null; code: number; tempC: number }

export type WeatherAlert = {
  id: string
  title: string
  description: string
  /** Issuing authority as the provider names it, e.g. "PAGASA". */
  authority: string
  authorityUrl: string | null
  severity: string
  urgency: string
  areaName: string
  instructions: string[]
  startAt: number | null
  expiresAt: number | null
}

export type WeatherPayload = {
  provider: 'google' | 'none'
  fetchedAt: number
  error?: string
  current?: {
    observedAt: number
    tempC: number
    feelsLikeC: number | null
    label: string
    /** WMO-style code derived from Google's condition type, used for icons and wording. */
    code: number
    conditionType: string
    isDay: boolean
    rainPct: number | null
    thunderPct: number | null
    precipMm: number
    windKph: number
    gustKph: number | null
    humidityPct: number | null
  }
  hourly?: HourForecast[]
  alerts?: WeatherAlert[]
}

type Env = Record<string, string | undefined>

export const WEATHER_BASE = 'https://weather.googleapis.com/v1'
export const CAMPUS_POINTS: Record<string, readonly [number, number]> = {
  alangilan: [13.7842, 121.0744],
  'pablo-borbon': [13.75547, 121.05364],
  malvar: [14.0449, 121.1569],
}
const HOURS = 8
const TIMEOUT_MS = 8000

export const isWeatherCampus = (v: string | null): v is string => v != null && Object.hasOwn(CAMPUS_POINTS, v)

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const text = (v: unknown, max = 600) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const time = (v: unknown) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN
  return Number.isFinite(t) ? t : null
}
const pct = (v: unknown) => (finite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null)

/** Google condition type ("LIGHT_RAIN", "THUNDERSTORM", …) → the WMO-style code the app's icons use. */
export function codeOf(type: string): number {
  const t = type.toUpperCase()
  if (t.includes('THUNDER')) return 95
  if (/SNOW|HAIL|SLEET|FLURR/.test(t)) return 71
  if (t.includes('RAIN') || t.includes('SHOWER')) {
    if (t.includes('HEAVY')) return 65
    if (t.includes('LIGHT') || t.includes('CHANCE') || t.includes('SCATTERED')) return 61
    return 63
  }
  if (t.includes('FOG') || t.includes('HAZE') || t.includes('MIST')) return 45
  if (t === 'CLEAR') return 0
  if (t === 'MOSTLY_CLEAR') return 1
  if (t === 'PARTLY_CLOUDY') return 2
  return 3
}

const toKph = (w: { value?: unknown; unit?: unknown } | undefined) => {
  if (!w || !finite(w.value)) return null
  return Math.round(w.unit === 'MILES_PER_HOUR' ? w.value * 1.609 : w.value)
}
const toC = (t: { degrees?: unknown; unit?: unknown } | undefined) => {
  if (!t || !finite(t.degrees)) return null
  return t.unit === 'FAHRENHEIT' ? Math.round(((t.degrees - 32) * 5) / 9) : Math.round(t.degrees)
}
const toMm = (q: { quantity?: unknown; unit?: unknown } | undefined) => {
  if (!q || !finite(q.quantity)) return 0
  return Math.round((q.unit === 'INCHES' ? q.quantity * 25.4 : q.quantity) * 10) / 10
}

type GCondition = { type?: unknown; description?: { text?: unknown } }
type GCurrent = {
  currentTime?: unknown; isDaytime?: unknown; weatherCondition?: GCondition; temperature?: { degrees?: unknown; unit?: unknown }
  feelsLikeTemperature?: { degrees?: unknown; unit?: unknown }; relativeHumidity?: unknown; thunderstormProbability?: unknown
  precipitation?: { probability?: { percent?: unknown }; qpf?: { quantity?: unknown; unit?: unknown } }
  wind?: { speed?: { value?: unknown; unit?: unknown }; gust?: { value?: unknown; unit?: unknown } }
}

export function parseCurrent(json: unknown): WeatherPayload['current'] {
  const c = json as GCurrent | null
  const tempC = toC(c?.temperature)
  const type = text(c?.weatherCondition?.type, 60)
  const observedAt = time(c?.currentTime)
  if (tempC == null || !type || observedAt == null) throw new Error('Google Weather: no current conditions')
  return {
    observedAt, tempC, conditionType: type, code: codeOf(type),
    feelsLikeC: toC(c!.feelsLikeTemperature),
    label: text(c!.weatherCondition?.description?.text, 60) || type.replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase()),
    isDay: c!.isDaytime !== false,
    rainPct: pct(c!.precipitation?.probability?.percent),
    thunderPct: pct(c!.thunderstormProbability),
    precipMm: toMm(c!.precipitation?.qpf),
    windKph: toKph(c!.wind?.speed) ?? 0,
    gustKph: toKph(c!.wind?.gust),
    humidityPct: pct(c!.relativeHumidity),
  }
}

export function parseHours(json: unknown): HourForecast[] {
  const hours = (json as { forecastHours?: unknown[] } | null)?.forecastHours
  if (!Array.isArray(hours)) return []
  const out: HourForecast[] = []
  for (const h of hours as { interval?: { startTime?: unknown }; weatherCondition?: GCondition; temperature?: { degrees?: unknown; unit?: unknown }; precipitation?: { probability?: { percent?: unknown } } }[]) {
    const t = time(h?.interval?.startTime)
    const tempC = toC(h?.temperature)
    const type = text(h?.weatherCondition?.type, 60)
    if (t == null || tempC == null || !type) continue
    out.push({ t, rainPct: pct(h.precipitation?.probability?.percent), code: codeOf(type), tempC })
  }
  return out.sort((a, b) => a.t - b.t)
}

export function parseAlerts(json: unknown): WeatherAlert[] {
  const list = (json as { weatherAlerts?: unknown[] } | null)?.weatherAlerts
  if (!Array.isArray(list)) return []
  const out: WeatherAlert[] = []
  for (const a of list as Record<string, unknown>[]) {
    if (!a || typeof a !== 'object') continue
    const ds = (a.dataSource ?? {}) as { name?: unknown; publisher?: unknown; authorityUri?: unknown }
    const title = text((a.alertTitle as { text?: unknown } | undefined)?.text, 200) || text(a.eventType, 120).replace(/_/g, ' ')
    const authority = text(ds.name, 120) || text(ds.publisher, 120)
    if (!title || !authority) continue
    let authorityUrl: string | null = null
    try {
      const u = typeof ds.authorityUri === 'string' ? new URL(ds.authorityUri) : null
      authorityUrl = u && u.protocol === 'https:' ? u.toString() : null
    } catch {
      authorityUrl = null
    }
    out.push({
      id: text(a.alertId, 120) || `${authority}-${title}-${text(a.startTime, 40)}`,
      title, authority, authorityUrl,
      description: text(a.description, 1200),
      severity: text(a.severity, 30) || 'UNKNOWN',
      urgency: text(a.urgency, 30) || 'UNKNOWN',
      areaName: text(a.areaName, 200),
      instructions: (Array.isArray(a.instruction) ? a.instruction : []).map((x) => text(x, 300)).filter(Boolean).slice(0, 6),
      startAt: time(a.startTime),
      expiresAt: time(a.expirationTime),
    })
  }
  return out
}

const lookup = (path: string, [lat, lng]: readonly [number, number], key: string, extra: Record<string, string> = {}) =>
  `${WEATHER_BASE}/${path}?${new URLSearchParams({ key, 'location.latitude': String(lat), 'location.longitude': String(lng), languageCode: 'en', ...extra })}`

export async function getWeather(campus: string, env: Env, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<WeatherPayload> {
  const key = (env.GOOGLE_WEATHER_API_KEY ?? env.WEATHER_API_KEY)?.trim()
  if (!key) return { provider: 'none', fetchedAt: now }
  const point = CAMPUS_POINTS[campus]
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  const get = async (url: string) => {
    const res = await fetchImpl(url, { signal: ctl.signal })
    if (res.status === 429) throw new Error('Google Weather quota reached')
    if (!res.ok) throw new Error(`Google Weather HTTP ${res.status}`)
    return res.json()
  }
  try {
    const [cur, hrs, alerts] = await Promise.allSettled([
      get(lookup('currentConditions:lookup', point, key)),
      get(lookup('forecast/hours:lookup', point, key, { hours: String(HOURS), pageSize: String(HOURS) })),
      get(lookup('publicAlerts:lookup', point, key)),
    ])
    if (cur.status === 'rejected') throw cur.reason
    return {
      provider: 'google', fetchedAt: now,
      current: parseCurrent(cur.value),
      hourly: hrs.status === 'fulfilled' ? parseHours(hrs.value) : [],
      // A failed alerts lookup is reported, never shown as "no alerts".
      ...(alerts.status === 'fulfilled' ? { alerts: parseAlerts(alerts.value) } : { error: 'Weather alerts unavailable' }),
    }
  } catch (e) {
    const msg = ctl.signal.aborted ? 'Google Weather timed out' : (e as Error).message.startsWith('Google Weather') ? (e as Error).message : 'Google Weather unreachable'
    return { provider: 'google', fetchedAt: now, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

const serverEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {}

const MEMO_MS = 15 * 60_000
const memo = new Map<string, { at: number; body: WeatherPayload }>()
const inflight = new Map<string, Promise<WeatherPayload>>()

export function resetWeatherMemo() {
  memo.clear()
  inflight.clear()
}

/** Shared by the Vercel Function and the Vite dev/preview middleware. */
export async function handleWeather(request: Request, env: Env = serverEnv(), fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return Response.json({ error: 'method not allowed' }, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const campus = new URL(request.url).searchParams.get('campus')
  if (!isWeatherCampus(campus)) return Response.json({ error: 'unknown campus' }, { status: 400 })
  const now = Date.now()
  const hit = memo.get(campus)
  let body: WeatherPayload
  if (hit && now - hit.at < MEMO_MS) body = hit.body
  else {
    let p = inflight.get(campus)
    if (!p) {
      p = getWeather(campus, env, fetchImpl, now).finally(() => inflight.delete(campus))
      inflight.set(campus, p)
    }
    body = await p
    if (body.current) memo.set(campus, { at: now, body })
  }
  const cacheable = body.current && !body.error
  return Response.json(body, {
    headers: { 'Cache-Control': cacheable ? 'public, s-maxage=1800, stale-while-revalidate=1800' : 'no-store', 'X-Content-Type-Options': 'nosniff' },
  })
}

export function GET(request: Request) {
  return handleWeather(request)
}
