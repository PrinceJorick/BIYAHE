import { describe, expect, it, vi } from 'vitest'
import { getNews, gnewsUrl, handleNews, newsQuery, parseGNews } from '../../api/news'
import { readNews, type NewsSnapshot } from './news'

const T = '2026-11-19T08:00:00Z'
const article = (o: Record<string, unknown> = {}) => ({ title: 'Flooding closes JP Laurel Hwy lane', url: 'https://news.example.ph/a', publishedAt: T, source: { name: 'Example News' }, ...o })

describe('GNews parsing (server)', () => {
  it('keeps titled, dated web links, newest first, without duplicates', () => {
    const items = parseGNews({ articles: [
      article(),
      article({ url: 'https://news.example.ph/b', title: 'Class suspension in Batangas City', publishedAt: '2026-11-19T09:00:00Z' }),
      article(),                                            // duplicate
      article({ url: 'javascript:alert(1)', title: 'x' }),  // not a web link
      article({ url: 'https://n.ph/c', title: '' }),         // no title
      article({ url: 'https://n.ph/d', title: 'y', publishedAt: 'soon' }),
    ] })
    expect(items.map((i) => i.title)).toEqual(['Class suspension in Batangas City', 'Flooding closes JP Laurel Hwy lane'])
    expect(items[1]).toEqual({ id: 'https://news.example.ph/a', title: 'Flooding closes JP Laurel Hwy lane', url: 'https://news.example.ph/a', source: 'Example News', publishedAt: Date.parse(T) })
  })

  it('handles junk', () => {
    expect(parseGNews(null)).toEqual([])
    expect(parseGNews({ articles: 'no' })).toEqual([])
  })

  it('builds a campus query and keeps the key out of logs-friendly parts', () => {
    expect(newsQuery('malvar')).toMatch(/^\(Malvar OR Lipa OR Tanauan\) Batangas AND \(flood/)
    expect(newsQuery('alangilan')).toContain('"Batangas City"')
    expect(gnewsUrl('a b', 'K&1')).toBe('https://gnews.io/api/v4/search?q=a%20b&lang=en&country=ph&max=10&sortby=publishedAt&apikey=K%261')
  })
})

describe('getNews / handler', () => {
  it('without a key answers an empty list from provider "none" and calls nothing', async () => {
    const f = vi.fn()
    expect(await getNews('alangilan', {}, f as unknown as typeof fetch, 1)).toEqual({ items: [], provider: 'none', fetchedAt: 1 })
    expect(f).not.toHaveBeenCalled()
  })

  it('with a key reads GNews; an HTTP error is reported, never thrown', async () => {
    const ok = vi.fn(async () => Response.json({ articles: [article()] }))
    expect((await getNews('alangilan', { GNEWS_API_KEY: 'k' }, ok as unknown as typeof fetch, 1)).items).toHaveLength(1)
    const bad = vi.fn(async () => new Response('quota', { status: 429 }))
    expect(await getNews('alangilan', { GNEWS_API_KEY: 'k' }, bad as unknown as typeof fetch, 1)).toEqual({ items: [], provider: 'gnews', fetchedAt: 1, error: 'GNews HTTP 429' })
  })

  it('rejects unknown campuses and caches good answers at the edge', async () => {
    expect((await handleNews(new Request('http://x/api/news?campus=mars'), {})).status).toBe(400)
    const r = await handleNews(new Request('http://x/api/news?campus=malvar'), {})
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toContain('s-maxage=900')
  })
})

describe('readNews (client)', () => {
  it('the server payload type is the client snapshot type', async () => {
    const payload: NewsSnapshot = await getNews('alangilan', {}, fetch, 1)
    expect(readNews(payload)).toEqual(payload)
  })

  it('accepts a valid payload and drops bad items', () => {
    const n = readNews({ items: [{ id: 'a', title: 't', url: 'https://x.ph', source: 's', publishedAt: 1 }, { id: 'b' }], provider: 'gnews', fetchedAt: 5 })
    expect(n).toEqual({ items: [{ id: 'a', title: 't', url: 'https://x.ph', source: 's', publishedAt: 1 }], provider: 'gnews', fetchedAt: 5 })
  })
  it('rejects anything else', () => {
    expect(readNews(null)).toBeNull()
    expect(readNews({ items: [], provider: 'rss', fetchedAt: 1 })).toBeNull()
  })
})
