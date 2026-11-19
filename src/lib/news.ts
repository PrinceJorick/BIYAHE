// Client side of /api/news (api/news.ts): fetches local news for the campus, validates it, and keeps the last
// good copy in IndexedDB for offline reading. News is shown as news, never as an official advisory.
// Same shapes as api/news.ts (kept here so the app imports nothing outside src/; news.test.ts checks they match).
export type NewsItem = { id: string; title: string; url: string; source: string; publishedAt: number }
export type NewsSnapshot = { items: NewsItem[]; provider: 'gnews' | 'none'; fetchedAt: number; error?: string }

const isItem = (x: unknown): x is NewsItem => {
  const n = x as NewsItem
  return Boolean(n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.source === 'string'
    && typeof n.url === 'string' && /^https?:\/\//.test(n.url) && Number.isFinite(n.publishedAt))
}

/** Validates a payload from the server or IndexedDB. Returns null when it is not one. */
export function readNews(json: unknown): NewsSnapshot | null {
  const d = json as Partial<NewsSnapshot> | null
  if (!d || !Array.isArray(d.items) || (d.provider !== 'gnews' && d.provider !== 'none') || !Number.isFinite(d.fetchedAt)) return null
  return { items: d.items.filter(isItem).slice(0, 12), provider: d.provider, fetchedAt: d.fetchedAt!, ...(typeof d.error === 'string' ? { error: d.error } : {}) }
}

export async function fetchNews(campus: string, fetchImpl: typeof fetch = fetch): Promise<NewsSnapshot> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 9000)
  try {
    const res = await fetchImpl(`/api/news?campus=${encodeURIComponent(campus)}`, { signal: ctl.signal })
    if (!res.ok) throw new Error(`news HTTP ${res.status}`)
    const news = readNews(await res.json())
    if (!news) throw new Error('news: unexpected response')
    return news
  } finally {
    clearTimeout(timer)
  }
}
