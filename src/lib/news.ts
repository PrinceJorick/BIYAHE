// Client side of /api/news (api/news.ts): fetches local news, validates it, matches it to the student's campus and
// route, and keeps a short-lived copy in IndexedDB for offline reading. News is always shown as a third-party
// report (publisher + time), never as an official advisory.
// Same shapes as api/news.ts (kept here so the app imports nothing outside src/; news.test.ts checks they match).
import type { CampusId } from '../types'

export type NewsTopic = 'flood' | 'rain' | 'road' | 'classes'
export type NewsItem = {
  id: string
  title: string
  summary: string
  source: string
  sourceDomain: string
  url: string
  publishedAt: number
  places: string[]
  topics: NewsTopic[]
}
export type NewsSnapshot = { items: NewsItem[]; provider: 'currents' | 'none'; fetchedAt: number; error?: string; retryAfter?: number }

/**
 * How long a saved news list may be shown offline. A short operational cache only (Currents' terms do not cover
 * an archive): older copies are not shown and are removed on start.
 */
export const NEWS_CACHE_TTL_MS = 24 * 3_600_000

export const CURRENTS_CREDIT = { label: 'Powered by Currents News API', url: 'https://currentsapi.services/' } as const

const TOPICS: NewsTopic[] = ['flood', 'rain', 'road', 'classes']
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Same rule as the server: https, a host, no credentials. Anything else is not linked. */
export function isSafeArticleUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && Boolean(u.hostname) && !u.username && !u.password
  } catch {
    return false
  }
}

function readItem(x: unknown): NewsItem | null {
  const n = x as Partial<NewsItem> | null
  if (!n || typeof n.id !== 'string' || typeof n.title !== 'string' || !n.title || typeof n.source !== 'string'
    || !isSafeArticleUrl(n.url) || !Number.isFinite(n.publishedAt)) return null
  return {
    id: n.id, title: n.title, summary: typeof n.summary === 'string' ? n.summary : '', source: n.source,
    sourceDomain: typeof n.sourceDomain === 'string' ? n.sourceDomain : new URL(n.url).hostname,
    url: n.url, publishedAt: n.publishedAt!, places: strings(n.places), topics: strings(n.topics).filter((t): t is NewsTopic => TOPICS.includes(t as NewsTopic)),
  }
}

/** Validates a payload from the server or IndexedDB. Returns null when it is not one. */
export function readNews(json: unknown): NewsSnapshot | null {
  const d = json as Partial<NewsSnapshot> | null
  if (!d || !Array.isArray(d.items) || (d.provider !== 'currents' && d.provider !== 'none') || !Number.isFinite(d.fetchedAt)) return null
  const items = d.items.map(readItem).filter((x): x is NewsItem => x !== null).slice(0, 30)
  return {
    items, provider: d.provider, fetchedAt: d.fetchedAt!,
    ...(typeof d.error === 'string' ? { error: d.error } : {}),
    ...(Number.isFinite(d.retryAfter) ? { retryAfter: d.retryAfter } : {}),
  }
}

/** A saved copy is usable offline only within NEWS_CACHE_TTL_MS of when it was fetched. */
export const savedNewsUsable = (n: NewsSnapshot | null, now: number) => Boolean(n && n.fetchedAt > 0 && now - n.fetchedAt < NEWS_CACHE_TTL_MS)

export async function fetchNews(fetchImpl: typeof fetch = fetch): Promise<NewsSnapshot> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 12_000)
  try {
    const res = await fetchImpl('/api/news', { signal: ctl.signal })
    if (!res.ok && res.status !== 429) throw new Error(`news HTTP ${res.status}`)
    const news = readNews(await res.json())
    if (!news) throw new Error('news: unexpected response')
    return news
  } finally {
    clearTimeout(timer)
  }
}

// ── Relevance ───────────────────────────────────────────────────────────────
// Which news places matter to each route home (by corridor id) and to each campus itself. One dictionary, so
// screens never match place names on their own.
export const CORRIDOR_PLACES: Record<string, string[]> = {
  // Alangilan
  lipa: ['lipa', 'jp-laurel'],
  batangas: ['batangas-city'],
  bauan: ['bauan', 'san-pascual', 'diversion-road'],
  sanjose: ['san-jose', 'ibaan'],
  tanauan: ['tanauan', 'sto-tomas', 'star-tollway'],
  rosario: ['ibaan', 'rosario'],
  // Pablo Borbon
  'pb-lipa': ['lipa', 'jp-laurel'],
  'pb-sanjose': ['san-jose', 'jp-laurel'],
  'pb-bauan': ['bauan', 'san-pascual'],
  'pb-rosario': ['ibaan', 'rosario'],
  'pb-lemery': ['bauan', 'lemery', 'taal'],
  // Malvar
  'mv-lipa': ['lipa', 'jp-laurel'],
  'mv-tanauan': ['tanauan', 'star-tollway'],
  'mv-stotomas': ['sto-tomas', 'jp-laurel'],
  'mv-batangas': ['batangas-city', 'jp-laurel'],
  'mv-balete': ['balete'],
}
export const CAMPUS_PLACES: Record<CampusId, string[]> = {
  alangilan: ['batangas-city'],
  'pablo-borbon': ['batangas-city'],
  malvar: ['malvar'],
}

/** The places that make an article relevant to this campus and (optionally) one route home. */
export const placesFor = (campus: CampusId, corridorId: string | null) =>
  new Set([...CAMPUS_PLACES[campus], ...(corridorId ? CORRIDOR_PLACES[corridorId] ?? [] : [])])

/** Disruption news (flood, rain, roads, classes) that names the campus or the route's places, newest first. */
export function relevantNews(items: readonly NewsItem[], campus: CampusId, corridorId: string | null): NewsItem[] {
  const places = placesFor(campus, corridorId)
  return items.filter((n) => n.topics.length > 0 && n.places.some((p) => places.has(p)))
}

/** Disruption news anywhere in Batangas (the coordinator's monitor), newest first. */
export const disruptionNews = (items: readonly NewsItem[]) => items.filter((n) => n.topics.length > 0)

/** "15m ago", "3h ago", "2d ago". */
export function relTime(t: number, now: number) {
  const m = Math.max(0, Math.round((now - t) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`
}
