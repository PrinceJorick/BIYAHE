// GET /api/news: recent local weather news about Batangas commuter places (rain, storms, floods). Anything that is
// not about the weather is left out, however local it is.
//
// Runs server-side so the key never reaches the browser: as a Vercel Function in production (this file), and
// through the Vite dev/preview server locally (vite.config.ts mounts the same handler). Provider: Currents News
// API (https://currentsapi.services), authenticated with `Authorization: Bearer CURRENTS_API_KEY`. Without a key
// the response is an empty list with provider "none".
//
// Currents' /v1/search ORs every keyword (AND and parentheses are ignored) and returns at most 20 articles, so
// two searches are made (places, then weather in the Philippines) and an article is kept only if its title or
// description names a known Batangas place and is about the weather (WEATHER_TOPICS). The free plan allows 250 requests a day: one refresh costs 2, the
// response is cached at the edge for 30 minutes and in this instance's memory for 15, and a 429 is passed on with
// its Retry-After so the app backs off.
//
// Terms: only the title, the provider's short description and the original publisher link are passed on. No
// article text is fetched or scraped, nothing is sent to an AI model, and nothing is stored beyond the cache.
//
// Self-contained (no imports) so Vercel can build it as-is; the pure helpers are unit-tested in src/lib/news.test.ts.

export type NewsTopic = 'flood' | 'rain' | 'road' | 'classes'

export type NewsItem = {
  id: string
  title: string
  /** The provider's short description (at most 300 characters), never the article text. */
  summary: string
  /** Publisher name, from a maintained domain list; otherwise the publisher's own domain. */
  source: string
  sourceDomain: string
  /** Original publisher link (https only). */
  url: string
  publishedAt: number
  /** Place keys named in the title or description (see PLACES). */
  places: string[]
  topics: NewsTopic[]
}

export type NewsPayload = {
  items: NewsItem[]
  provider: 'currents' | 'none'
  fetchedAt: number
  error?: string
  /** Seconds to wait before asking again (provider rate limit). */
  retryAfter?: number
}

type Env = Record<string, string | undefined>

export const CURRENTS_SEARCH = 'https://api.currentsapi.services/v1/search'
export const NEWS_QUERIES = [
  { keywords: 'Batangas OR "Lipa City" OR Tanauan OR Malvar' },
  { keywords: 'flood OR baha OR ulan OR bagyo OR typhoon OR "heavy rain" OR PAGASA OR "storm surge" OR landslide', country: 'PH' },
]
const PAGE_SIZE = 20
const WINDOW_DAYS = 7
const TIMEOUT_MS = 8000

// Place dictionary. `ctx`: the name is common elsewhere in the Philippines, so the text must also say Batangas.
export const PLACES: Record<string, { re: RegExp; ctx?: boolean }> = {
  batangas: { re: /\bbatangas\b/i },
  'batangas-city': { re: /\bbatangas city\b|lungsod ng batangas|\balangilan\b|pablo borbon|\bbatstateu\b|batangas state university/i },
  lipa: { re: /(?<!dua )\blipa\b/i },
  tanauan: { re: /\btanauan\b/i },
  malvar: { re: /\bmalvar\b/i, ctx: true },
  'sto-tomas': { re: /\b(sto\.?|santo) tomas\b/i, ctx: true },
  bauan: { re: /\bbauan\b/i },
  'san-pascual': { re: /\bsan pascual\b/i, ctx: true },
  'san-jose': { re: /\bsan jose\b/i, ctx: true },
  ibaan: { re: /\bibaan\b/i },
  rosario: { re: /\brosario\b/i, ctx: true },
  lemery: { re: /\blemery\b/i, ctx: true },
  taal: { re: /\btaal\b/i, ctx: true },
  balete: { re: /\bbalete\b/i, ctx: true },
  'star-tollway': { re: /\bstar\s?(toll(way)?|expressway)\b|southern tagalog arterial/i },
  'jp-laurel': { re: /\bj\.?\s?p\.? laurel\b/i, ctx: true },
  'diversion-road': { re: /\bdiversion road\b/i, ctx: true },
}

const TOPICS: Record<NewsTopic, RegExp> = {
  flood: /\bflood|\bbaha\b|binaha|pagbaha|\bsubmerged\b|\bstorm surge/i,
  rain: /\bheavy rain|\brainfall\b|\bulan\b|\bbagyo\b|\btyphoon\b|tropical (storm|depression)|\bhabagat\b|low pressure area|\bpagasa\b|thunderstorm/i,
  road: /road closure|\bclosed road|\b(heavy|slow|monster|road) traffic\b|traffic (jam|advisory|congestion|rerouting|scheme)|\blandslide|\bgridlock\b|\breroute|\bimpassable\b|\bdetour\b|road accident|vehicular accident|\bcollision\b/i,
  classes: /class(es)? suspen|suspen\w* (of )?classes|walang pasok|no classes|\bsuspended\b.*\bclasses\b/i,
}

// Publisher names for common Philippine outlets. Anything else is shown by its own domain, never a guessed name.
const PUBLISHERS: Record<string, string> = {
  'inquirer.net': 'Inquirer',
  'philstar.com': 'Philstar',
  'gmanetwork.com': 'GMA News',
  'abs-cbn.com': 'ABS-CBN News',
  'rappler.com': 'Rappler',
  'mb.com.ph': 'Manila Bulletin',
  'manilatimes.net': 'The Manila Times',
  'pna.gov.ph': 'Philippine News Agency',
  'bworldonline.com': 'BusinessWorld',
  'news5.com.ph': 'News5',
  'tv5.com.ph': 'News5',
  'sunstar.com.ph': 'SunStar',
  'pep.ph': 'PEP',
  'interaksyon.philstar.com': 'Interaksyon',
  'politiko.com.ph': 'Politiko',
  'brigadanews.ph': 'Brigada News',
  'bomboradyo.com': 'Bombo Radyo',
  'remate.ph': 'Remate',
  'abante.com.ph': 'Abante',
  'journal.com.ph': "People's Journal",
  'onenews.ph': 'OneNews',
  'cnnphilippines.com': 'CNN Philippines',
  'reuters.com': 'Reuters',
  'apnews.com': 'AP News',
}

/** Publisher name for a host: the longest matching known domain, else the host without "www.". */
export function publisherOf(host: string): { name: string; domain: string } {
  const h = host.toLowerCase().replace(/^www\./, '')
  const known = Object.keys(PUBLISHERS).filter((d) => h === d || h.endsWith(`.${d}`)).sort((a, b) => b.length - a.length)[0]
  return { name: known ? PUBLISHERS[known] : h, domain: known ?? h }
}

/** An https article link with a host, or null. Every other scheme (http, javascript:, data:, file:) is refused. */
export function safeArticleUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2048) return null
  try {
    const u = new URL(v.trim())
    if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null
    if (/(^|\.)currentsapi\.services$/i.test(u.hostname)) return null
    return u.toString()
  } catch {
    return null
  }
}

/** Currents dates look like "2026-11-19 19:10:22 +0000". Returns epoch ms or NaN. */
export function parseCurrentsDate(v: unknown): number {
  if (typeof v !== 'string') return NaN
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(v.trim())
  if (!m) return Date.parse(v)
  const tz = !m[3] || m[3] === 'Z' ? 'Z' : `${m[3].slice(0, 3)}:${m[3].slice(-2)}`
  return Date.parse(`${m[1]}T${m[2]}${tz}`)
}

const clean = (v: unknown, max: number) => {
  if (typeof v !== 'string') return ''
  const t = v.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

/** Place keys named in a text. Context-only names count only when the text also says Batangas. */
export function placesIn(text: string): string[] {
  const batangas = PLACES.batangas.re.test(text)
  return Object.entries(PLACES).filter(([, p]) => p.re.test(text) && (!p.ctx || batangas)).map(([k]) => k)
}

/** Only weather news is shown: rain and storms, and the floods they cause. Roads and classes tag an article that is
 * already about the weather (e.g. classes suspended for rain), never qualify one on their own. */
export const WEATHER_TOPICS: NewsTopic[] = ['flood', 'rain']

export const topicsIn = (text: string) => (Object.keys(TOPICS) as NewsTopic[]).filter((t) => TOPICS[t].test(text))

const titleKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Currents search responses → weather news about Batangas places, newest first. Drops anything without a title,
 * an https publisher link, a valid date, a Batangas place or a weather topic, and duplicates (same link or headline).
 */
export function parseCurrents(responses: unknown[], now = Date.now()): NewsItem[] {
  const out: NewsItem[] = []
  for (const json of responses) {
    const news = (json as { news?: unknown[] } | null)?.news
    if (!Array.isArray(news)) continue
    for (const a of news as Record<string, unknown>[]) {
      if (!a || typeof a !== 'object') continue
      const title = clean(a.title, 200)
      const url = safeArticleUrl(a.url)
      const publishedAt = parseCurrentsDate(a.published)
      if (!title || !url || !Number.isFinite(publishedAt) || publishedAt > now + 3_600_000) continue
      const summary = clean(a.description, 300)
      const text = `${title} ${summary}`
      const places = placesIn(text)
      const topics = topicsIn(text)
      if (!places.length || !topics.some((t) => WEATHER_TOPICS.includes(t))) continue
      if (out.some((x) => x.url === url || titleKey(x.title) === titleKey(title))) continue
      const pub = publisherOf(new URL(url).hostname)
      const id = typeof a.id === 'string' && a.id ? a.id.slice(0, 80) : url
      out.push({ id, title, summary, source: pub.name, sourceDomain: pub.domain, url, publishedAt, places, topics })
    }
  }
  return out.sort((a, b) => b.publishedAt - a.publishedAt)
}

export function currentsUrl(q: { keywords: string; country?: string }, now: number) {
  // Currents accepts a date window only with both ends (start_date alone is a 400), in RFC 3339.
  const rfc = (t: number) => `${new Date(t).toISOString().slice(0, 19)}+00:00`
  const p = new URLSearchParams({ keywords: q.keywords, page_size: String(PAGE_SIZE), start_date: rfc(now - WINDOW_DAYS * 86_400_000), end_date: rfc(now) })
  if (q.country) p.set('country', q.country)
  return `${CURRENTS_SEARCH}?${p}`
}

const retryAfterS = (res: Response) => {
  const v = res.headers.get('retry-after')
  const n = v == null ? NaN : Number(v)
  if (Number.isFinite(n)) return Math.max(1, Math.min(86_400, Math.round(n)))
  const at = v == null ? NaN : Date.parse(v)
  return Number.isFinite(at) ? Math.max(1, Math.min(86_400, Math.round((at - Date.now()) / 1000))) : 3600
}

export async function getNews(env: Env, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<NewsPayload> {
  const key = env.CURRENTS_API_KEY?.trim()
  if (!key) return { items: [], provider: 'none', fetchedAt: now }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const bodies: unknown[] = []
    for (const q of NEWS_QUERIES) {
      const res = await fetchImpl(currentsUrl(q, now), { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, signal: ctl.signal })
      if (res.status === 429) return { items: [], provider: 'currents', fetchedAt: now, error: 'Currents rate limit reached', retryAfter: retryAfterS(res) }
      if (!res.ok) return { items: [], provider: 'currents', fetchedAt: now, error: `Currents HTTP ${res.status}` }
      const body = await res.json().catch(() => null)
      if (!body || (body as { status?: unknown }).status !== 'ok') return { items: [], provider: 'currents', fetchedAt: now, error: 'Currents: unexpected response' }
      bodies.push(body)
    }
    return { items: parseCurrents(bodies, now).slice(0, 30), provider: 'currents', fetchedAt: now }
  } catch {
    return { items: [], provider: 'currents', fetchedAt: now, error: ctl.signal.aborted ? 'Currents timed out' : 'Currents unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

// Server environment (Vercel / Node). Read through globalThis so this file also type-checks in the browser project.
const serverEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {}

// One answer per instance for MEMO_MS, and one request in flight at a time.
const MEMO_MS = 15 * 60_000
let memo: { at: number; body: NewsPayload } | null = null
let inflight: Promise<NewsPayload> | null = null

export function resetNewsMemo() {
  memo = null
  inflight = null
}

/** Shared by the Vercel Function and the Vite dev/preview middleware. */
export async function handleNews(request: Request, env: Env = serverEnv(), fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return Response.json({ error: 'method not allowed' }, { status: 405, headers: { Allow: 'GET, HEAD' } })
  const now = Date.now()
  let body: NewsPayload
  if (memo && now - memo.at < MEMO_MS) body = memo.body
  else {
    inflight ??= getNews(env, fetchImpl, now).finally(() => { inflight = null })
    body = await inflight
    if (!body.error) memo = { at: now, body }
  }
  const headers: Record<string, string> = {
    'Cache-Control': body.error ? 'no-store' : 'public, s-maxage=1800, stale-while-revalidate=3600',
    'X-Content-Type-Options': 'nosniff',
  }
  if (body.retryAfter) headers['Retry-After'] = String(body.retryAfter)
  return Response.json(body, { status: body.retryAfter ? 429 : 200, headers })
}

export function GET(request: Request) {
  return handleNews(request)
}
