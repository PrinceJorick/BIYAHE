// Notices the app derives from its own data sources (Google Weather forecast, Google live traffic), shown beside
// official advisories and news on the details and Alerts screens. They are labelled with their source and are
// never presented as official advisories. Pure, tested in notices.test.ts.
import type { HourForecast } from '../types'
import type { RoutePlace } from './places'
import { rainLevel, type Level } from './traffic'

export type Notice = { id: string; kind: 'rain' | 'traffic'; title: string; detail: string; level: Level; word: string; source: string; at: number }

const hour = (t: number) => new Date(t).toLocaleTimeString('en-PH', { hour: 'numeric', timeZone: 'Asia/Manila' })

/** The wettest of the next six hours, when its chance of rain is 30% or more. */
export function rainNotice(hourly: readonly HourForecast[] | undefined, fetchedAt: number, now: number): Notice | null {
  const next = (hourly ?? []).filter((h) => h.t + 3_600_000 > now && h.t < now + 6 * 3_600_000 && h.rainPct != null)
  if (!next.length) return null
  const peak = next.reduce((a, b) => (b.rainPct! > a.rainPct! ? b : a))
  const level = rainLevel(peak.rainPct)
  if (level === 'low' || level === 'none') return null
  const when = peak.t <= now ? 'this hour' : `around ${hour(peak.t)}`
  return {
    id: `rain-${peak.t}`, kind: 'rain', word: level === 'high' ? 'Likely' : 'Possible',
    title: level === 'high' ? `Rain likely ${when}` : `Rain possible ${when}`,
    detail: `${peak.rainPct}% chance of rain. Bring an umbrella and allow extra time if you head out.`,
    level, source: 'Google Weather forecast', at: fetchedAt,
  }
}

/** Routes with live heavy or moderate traffic (never closed ones: those carry an official advisory). */
export function trafficNotices(routes: readonly RoutePlace[]): Notice[] {
  return routes
    .filter((r) => r.traffic.source === 'live' && (r.traffic.level === 'heavy' || r.traffic.level === 'moderate'))
    .map((r): Notice => ({
      id: `traffic-${r.id}`, kind: 'traffic', word: r.traffic.level === 'heavy' ? 'Heavy' : 'Moderate',
      title: `${r.traffic.level === 'heavy' ? 'Heavy' : 'Moderate'} traffic to ${r.corridor.name}`,
      detail: `About ${r.traffic.minLo}–${r.traffic.minHi} min right now via ${r.corridor.via} (usually ${r.corridor.usualMin} min).`,
      level: r.traffic.level === 'heavy' ? 'high' : 'mid',
      source: 'Google live traffic',
      at: r.traffic.fetchedAt ?? 0,
    }))
}
