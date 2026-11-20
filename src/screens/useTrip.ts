// Everything the student screens derive from the store for one render: the view of their own route, every
// route and safe spot as a place, and the notices/news that go with a place.
import { ACTIVE_CAMPUS } from '../campuses/active'
import { corridors } from '../data'
import { studentAdvisories } from '../lib/advisories'
import { studentView } from '../lib/derive'
import { rainNotice, trafficNotices, type Notice } from '../lib/notices'
import { relevantNews, savedNewsUsable } from '../lib/news'
import { routePlaces, spotPlaces, type Place } from '../lib/places'
import { isOffline, useApp, useNow, type State } from '../lib/store'

export function useTrip(everyMs = 30_000) {
  const s = useApp()
  const now = useNow(everyMs)
  const view = studentView(s, now)
  const routes = routePlaces(s.snapshot, corridors, s.traffic?.routes ?? null, s.corridorId, now)
  const spots = spotPlaces(s.snapshot.spots)
  return { s, now, view, routes, spots }
}

/** Advisories, derived notices and the latest headlines relevant to one place. */
export function placeNotifications(s: State, place: Place, now: number) {
  const routeId = place.kind === 'route' ? place.id : s.corridorId
  const advisories = studentAdvisories(s.snapshot.advisories, routeId, now)
    .filter((a) => place.kind === 'route' || a.scope === 'campus' || a.scope === 'all')
  const notices: Notice[] = []
  const rain = rainNotice(s.weather?.hourly, s.weather?.fetchedAt ?? 0, now)
  if (rain) notices.push(rain)
  if (place.kind === 'route') notices.push(...trafficNotices([place]))
  return { advisories, notices, news: visibleNews(s, now, place.kind === 'route' ? place.id : s.corridorId).slice(0, 3), newsNote: newsNote(s, now) }
}

/** All local news that may be shown now: live, or a saved copy still within its offline lifetime. */
export function allNews(s: State, now: number) {
  if (!s.news) return []
  return isOffline(s) && !savedNewsUsable(s.news, now) ? [] : s.news.items
}

/** Disruption news for the campus and one route home (default: the student's own). */
export const visibleNews = (s: State, now: number, corridorId = s.corridorId) => relevantNews(allNews(s, now), ACTIVE_CAMPUS.id, corridorId)

/** Relevant news the student has not opened yet (part of the Alerts count). */
export const unreadNews = (s: State, now: number) => visibleNews(s, now).filter((n) => !s.newsRead.includes(n.id))

/** Why there is no news (or that it is old), in one short line; null when the news is fine. */
export function newsNote(s: State, now: number): string | null {
  if (isOffline(s)) return allNews(s, now).length ? 'Saved copy of the news. Connect to open the articles.' : 'No saved news on this device. News needs an internet connection.'
  if (!s.news) return null
  if (s.news.retryAfter) return 'The news service is busy. BIYAHE will try again later.'
  if (s.news.error) return s.news.items.length ? 'Could not refresh the news; showing the last copy.' : 'Local news could not be loaded right now.'
  if (s.news.provider === 'none') return import.meta.env.DEV ? 'Local news is off: add CURRENTS_API_KEY to .env.' : 'Local news is not available on this server.'
  return null
}
