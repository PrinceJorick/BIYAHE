// GET /api/news?campus=<id>: local news about floods, traffic, storms and class suspensions near a campus.
//
// Runs server-side so the key never reaches the browser: as a Vercel Function in production (this file), and
// through the Vite dev/preview server locally (vite.config.ts mounts the same handler). Provider: GNews
// (https://gnews.io) when GNEWS_API_KEY is set. Without a key the response is an empty list with provider
// "none"; the app then shows official advisories and its own weather/traffic notices only. (The Google News RSS
// feed is not used: its terms allow personal feed readers only.)
//
// Self-contained (no imports) so Vercel can build it as-is; the pure helpers are unit-tested in src/lib/news.test.ts.

export type NewsItem = { id: string; title: string; url: string; source: string; publishedAt: number }
export type NewsPayload = { items: NewsItem[]; provider: 'gnews' | 'none'; fetchedAt: number; error?: string }

type Env = Record<string, string | undefined>

const TOPICS = '(flood OR baha OR traffic OR typhoon OR bagyo OR "class suspension" OR PAGASA OR landslide OR "road closure")'
const PLACES: Record<string, string> = {
  alangilan: '"Batangas City"',
  'pablo-borbon': '"Batangas City"',
  malvar: '(Malvar OR Lipa OR Tanauan) Batangas',
}

export const isCampus = (v: string | null): v is string => v != null && Object.hasOwn(PLACES, v)

export const newsQuery = (campus: string) => `${PLACES[campus] ?? 'Batangas'} AND ${TOPICS}`

export const gnewsUrl = (q: string, key: string, max = 10) =>
  `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&country=ph&max=${max}&sortby=publishedAt&apikey=${encodeURIComponent(key)}`

const safeUrl = (v: unknown) => {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** GNews search response → news items. Drops anything without a title, a web link and a valid date. */
export function parseGNews(json: unknown): NewsItem[] {
  const articles = (json as { articles?: unknown[] } | null)?.articles
  if (!Array.isArray(articles)) return []
  const out: NewsItem[] = []
  for (const a of articles as { title?: unknown; url?: unknown; publishedAt?: unknown; source?: { name?: unknown } }[]) {
    const title = clean(a?.title, 200)
    const url = safeUrl(a?.url)
    const publishedAt = typeof a?.publishedAt === 'string' ? Date.parse(a.publishedAt) : NaN
    if (!title || !url || !Number.isFinite(publishedAt)) continue
    if (out.some((x) => x.url === url || x.title === title)) continue
    out.push({ id: url, title, url, source: clean(a.source?.name, 60) || new URL(url).hostname, publishedAt })
  }
  return out.sort((a, b) => b.publishedAt - a.publishedAt)
}

export async function getNews(campus: string, env: Env, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<NewsPayload> {
  const key = env.GNEWS_API_KEY?.trim()
  if (!key) return { items: [], provider: 'none', fetchedAt: now }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 8000)
  try {
    const res = await fetchImpl(gnewsUrl(newsQuery(campus), key), { signal: ctl.signal })
    if (!res.ok) return { items: [], provider: 'gnews', fetchedAt: now, error: `GNews HTTP ${res.status}` }
    return { items: parseGNews(await res.json()), provider: 'gnews', fetchedAt: now }
  } catch (e) {
    return { items: [], provider: 'gnews', fetchedAt: now, error: ctl.signal.aborted ? 'GNews timed out' : (e as Error).message }
  } finally {
    clearTimeout(timer)
  }
}

// Server environment (Vercel / Node). Read through globalThis so this file also type-checks in the browser project.
const serverEnv = (): Env => (globalThis as { process?: { env: Env } }).process?.env ?? {}

/** Shared by the Vercel Function and the Vite dev/preview middleware. */
export async function handleNews(request: Request, env: Env = serverEnv(), fetchImpl: typeof fetch = fetch): Promise<Response> {
  const campus = new URL(request.url).searchParams.get('campus')
  if (!isCampus(campus)) return Response.json({ error: 'unknown campus' }, { status: 400 })
  const body = await getNews(campus, env, fetchImpl)
  // Cached at the edge for 15 minutes (GNews free tier: 100 requests a day), served stale while refreshing.
  return Response.json(body, { headers: { 'Cache-Control': body.error ? 'no-store' : 'public, s-maxage=900, stale-while-revalidate=3600' } })
}

export function GET(request: Request) {
  return handleNews(request)
}
