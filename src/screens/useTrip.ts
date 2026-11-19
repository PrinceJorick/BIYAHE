// Everything the student screens derive from the store for one render: the view of their own route, every
// route and safe spot as a place, and the notices/news that go with a place.
import { corridors } from '../data'
import { studentAdvisories } from '../lib/advisories'
import { studentView } from '../lib/derive'
import { rainNotice, trafficNotices, type Notice } from '../lib/notices'
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
  const rain = rainNotice(s.weather.hourly, s.weather.fetchedAt, now)
  if (rain) notices.push(rain)
  if (place.kind === 'route') notices.push(...trafficNotices([place]))
  return { advisories, notices, news: s.news?.items.slice(0, 3) ?? [], newsNote: newsNote(s) }
}

/** Why there is no news (or that it is old), in one short line; null when the news is fine. */
export function newsNote(s: State): string | null {
  if (isOffline(s)) return s.news?.items.length ? 'News is from the last saved copy.' : 'News needs an internet connection.'
  if (!s.news) return null
  if (s.news.error) return s.news.items.length ? 'Could not refresh the news; showing the last copy.' : 'Local news could not be loaded right now.'
  if (s.news.provider === 'none') return import.meta.env.DEV ? 'Local news is off: add GNEWS_API_KEY to .env.' : null
  return null
}
