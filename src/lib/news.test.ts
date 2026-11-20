import { afterEach, describe, expect, it } from 'vitest'
import {
  currentsUrl, getNews, handleNews, NEWS_QUERIES, parseCurrents, parseCurrentsDate, placesIn, publisherOf, resetNewsMemo, safeArticleUrl, topicsIn,
  type NewsItem as ServerItem, type NewsPayload,
} from '../../api/news'
import { disruptionNews, isSafeArticleUrl, NEWS_CACHE_TTL_MS, readNews, relevantNews, relTime, savedNewsUsable, type NewsItem, type NewsSnapshot } from './news'

const NOW = Date.parse('2026-11-20T08:00:00Z')
const art = (o: Record<string, unknown>) => ({
  id: 'id-1', title: 'Baha sa Batangas City matapos ang malakas na ulan', description: 'Flooding hit parts of Batangas City.',
  url: 'https://newsinfo.inquirer.net/1/flood', author: 'reporter', image: null, language: 'en', published: '2026-11-20 06:00:00 +0000', ...o,
})
const body = (news: unknown[]) => ({ status: 'ok', news, page: 1 })

describe('Currents parsing (server)', () => {
  it('normalizes an article: description as summary, publisher from the domain list, epoch time, places and topics', () => {
    const [n] = parseCurrents([body([art({})])], NOW)
    expect(n).toEqual({
      id: 'id-1', title: 'Baha sa Batangas City matapos ang malakas na ulan', summary: 'Flooding hit parts of Batangas City.',
      source: 'Inquirer', sourceDomain: 'inquirer.net', url: 'https://newsinfo.inquirer.net/1/flood',
      publishedAt: Date.parse('2026-11-20T06:00:00Z'), places: ['batangas', 'batangas-city'], topics: ['flood', 'rain'],
    })
  })

  it('never uses the author as the publisher; unknown outlets show their own domain', () => {
    const [n] = parseCurrents([body([art({ url: 'https://www.example-local.ph/a', author: 'GMA News' })])], NOW)
    expect(n.source).toBe('example-local.ph')
    expect(publisherOf('www.gmanetwork.com')).toEqual({ name: 'GMA News', domain: 'gmanetwork.com' })
  })

  it('drops items without a title, a safe https link, a valid date or a Batangas place; uses the url when id is missing', () => {
    const items = parseCurrents([body([
      art({ title: '' }),
      art({ id: 'a', url: 'javascript:alert(1)' }),
      art({ id: 'b', url: 'http://insecure.ph/x' }),
      art({ id: 'c', published: 'yesterday-ish' }),
      art({ id: 'd', title: 'Flood in Cebu', description: 'Cebu streets submerged', url: 'https://x.ph/d' }),
      art({ id: undefined, url: 'https://x.ph/e', title: 'Traffic on STAR Tollway' }),
      'not an object', null,
    ])], NOW)
    expect(items.map((n) => n.id)).toEqual(['https://x.ph/e'])
  })

  it('removes duplicates across both searches (same link or same headline)', () => {
    const items = parseCurrents([body([art({})]), body([art({ id: 'id-2' }), art({ id: 'id-3', url: 'https://x.ph/other', title: 'BAHA sa Batangas City, matapos ang malakas na ulan!' })])], NOW)
    expect(items).toHaveLength(1)
  })

  it('keeps only weather news: local stories about anything else are dropped', () => {
    const items = parseCurrents([body([
      art({ id: 'biz', url: 'https://x.ph/biz', title: 'Chemrez to build Batangas biodiesel plant', description: 'A new plant in Batangas City.' }),
      art({ id: 'road', url: 'https://x.ph/road', title: 'Heavy traffic on STAR Tollway near Lipa City', description: 'A collision slowed traffic.' }),
      art({ id: 'wx', url: 'https://x.ph/wx', title: 'Heavy rain floods streets in Lipa City', description: 'PAGASA warned of more rain.' }),
      art({ id: 'cls', url: 'https://x.ph/cls', title: 'Walang pasok in Batangas City due to bagyo', description: 'Classes suspended as the typhoon nears.' }),
    ])], NOW)
    expect(items.map((n) => n.id).sort()).toEqual(['cls', 'wx'])
  })

  it('ignores Dua Lipa and needs a Batangas mention for common place names', () => {
    expect(placesIn('Dua Lipa buys a mansion')).toEqual([])
    expect(placesIn('Lipa City traffic')).toEqual(['lipa'])
    expect(placesIn('San Jose, Occidental Mindoro flood')).toEqual([])
    expect(placesIn('San Jose, Batangas flood')).toEqual(['batangas', 'san-jose'])
    expect(topicsIn('Walang pasok: class suspensions on Friday')).toEqual(['classes'])
    expect(topicsIn('Passenger traffic at Batangas Port rises')).toEqual([])
    expect(topicsIn('Heavy traffic on STAR Tollway after collision')).toEqual(['road'])
  })

  it('reads Currents dates and refuses junk', () => {
    expect(parseCurrentsDate('2026-11-19 19:10:22 +0000')).toBe(Date.parse('2026-11-19T19:10:22Z'))
    expect(parseCurrentsDate('2026-11-19 19:10:22 +0800')).toBe(Date.parse('2026-11-19T11:10:22Z'))
    expect(parseCurrentsDate(42)).toBeNaN()
  })

  it('accepts only https publisher links', () => {
    expect(safeArticleUrl('https://www.philstar.com/a')).toBe('https://www.philstar.com/a')
    for (const bad of ['http://a.ph', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'https://', 'not a url', 'https://u:p@a.ph', 'https://api.currentsapi.services/v1/x', 7])
      expect(safeArticleUrl(bad)).toBeNull()
  })

  it('searches with keywords, a page size of 20 and a 7-day window', () => {
    const u = new URL(currentsUrl(NEWS_QUERIES[1], NOW))
    expect(u.origin + u.pathname).toBe('https://api.currentsapi.services/v1/search')
    expect(u.searchParams.get('page_size')).toBe('20')
    expect(u.searchParams.get('country')).toBe('PH')
    expect(u.searchParams.get('start_date')).toBe('2026-11-13T08:00:00+00:00')
    expect(u.searchParams.get('end_date')).toBe('2026-11-20T08:00:00+00:00')
    expect(u.searchParams.has('apiKey')).toBe(false)
  })
})

describe('getNews / handleNews (server)', () => {
  afterEach(resetNewsMemo)
  const ok = (json: unknown) => (async () => new Response(JSON.stringify(json), { status: 200 })) as unknown as typeof fetch

  it('without a key returns provider none and makes no request', async () => {
    let called = false
    const f = (async () => { called = true; return new Response('{}') }) as unknown as typeof fetch
    expect(await getNews({}, f, NOW)).toEqual({ items: [], provider: 'none', fetchedAt: NOW })
    expect(called).toBe(false)
  })

  it('sends the key as a Bearer token, never in the URL', async () => {
    const seen: { url: string; auth: string | null }[] = []
    const f = (async (url: string, init: RequestInit) => {
      seen.push({ url, auth: new Headers(init.headers).get('authorization') })
      return new Response(JSON.stringify(body([art({})])))
    }) as unknown as typeof fetch
    const r = await getNews({ CURRENTS_API_KEY: 'secret' }, f, NOW)
    expect(r.items).toHaveLength(1)
    expect(seen).toHaveLength(2)
    expect(seen.every((x) => x.auth === 'Bearer secret' && !x.url.includes('secret'))).toBe(true)
  })

  it('passes a 429 on with Retry-After, and reports other failures without throwing', async () => {
    const limited = (async () => new Response('{}', { status: 429, headers: { 'Retry-After': '120' } })) as unknown as typeof fetch
    expect(await getNews({ CURRENTS_API_KEY: 'k' }, limited, NOW)).toEqual({ items: [], provider: 'currents', fetchedAt: NOW, error: 'Currents rate limit reached', retryAfter: 120 })
    const bad = (async () => new Response('{}', { status: 500 })) as unknown as typeof fetch
    expect((await getNews({ CURRENTS_API_KEY: 'k' }, bad, NOW)).error).toBe('Currents HTTP 500')
    expect((await getNews({ CURRENTS_API_KEY: 'k' }, ok({ status: 'error' }), NOW)).error).toBe('Currents: unexpected response')
    const down = (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch
    expect((await getNews({ CURRENTS_API_KEY: 'k' }, down, NOW)).error).toBe('Currents unreachable')
  })

  it('answers 429 with Retry-After to the app, caches good answers at the edge, refuses other methods', async () => {
    const limited = (async () => new Response('{}', { status: 429, headers: { 'Retry-After': '60' } })) as unknown as typeof fetch
    const r = await handleNews(new Request('http://x/api/news'), { CURRENTS_API_KEY: 'k' }, limited)
    expect(r.status).toBe(429)
    expect(r.headers.get('retry-after')).toBe('60')
    resetNewsMemo()
    const good = await handleNews(new Request('http://x/api/news'), { CURRENTS_API_KEY: 'k' }, ok(body([art({})])))
    expect(good.headers.get('cache-control')).toContain('s-maxage=1800')
    expect(((await good.json()) as NewsPayload).items).toHaveLength(1)
    expect((await handleNews(new Request('http://x/api/news', { method: 'POST' }), {}, ok({}))).status).toBe(405)
  })

  it('serves one answer per instance for a while (no request per page view)', async () => {
    let n = 0
    const f = (async () => { n++; return new Response(JSON.stringify(body([art({})]))) }) as unknown as typeof fetch
    await handleNews(new Request('http://x/api/news'), { CURRENTS_API_KEY: 'k' }, f)
    await handleNews(new Request('http://x/api/news'), { CURRENTS_API_KEY: 'k' }, f)
    expect(n).toBe(2) // two searches, once
  })
})

describe('news on the device', () => {
  const item: NewsItem = { id: 'a', title: 'Flooding on JP Laurel Hwy in Lipa City', summary: 's', source: 'Inquirer', sourceDomain: 'inquirer.net', url: 'https://newsinfo.inquirer.net/a', publishedAt: NOW - 15 * 60_000, places: ['lipa', 'jp-laurel'], topics: ['flood'] }
  const snap: NewsSnapshot = { items: [item], provider: 'currents', fetchedAt: NOW }

  it('keeps the client and server shapes in step', () => {
    const server: ServerItem = item
    expect(readNews({ ...snap, items: [server] })!.items[0]).toEqual(item)
  })

  it('validates saved copies and drops unsafe or incomplete items', () => {
    const n = readNews({ items: [item, { ...item, id: 'b', url: 'javascript:x' }, { id: 'c' }], provider: 'currents', fetchedAt: 5 })
    expect(n!.items.map((x) => x.id)).toEqual(['a'])
    expect(readNews({ items: [], provider: 'gnews', fetchedAt: 1 })).toBeNull()
    expect(readNews(null)).toBeNull()
  })

  it('matches news to the campus and route by place, and only disruption news', () => {
    const general = { ...item, id: 'g', topics: [] as NewsItem['topics'] }
    const malvar = { ...item, id: 'm', places: ['malvar'] }
    const pb = { ...item, id: 'p', places: ['bauan'] }
    const all = [item, general, malvar, pb]
    expect(relevantNews(all, 'alangilan', 'lipa').map((x) => x.id)).toEqual(['a'])
    expect(relevantNews(all, 'malvar', 'mv-tanauan').map((x) => x.id)).toEqual(['m'])
    expect(relevantNews(all, 'pablo-borbon', 'pb-bauan').map((x) => x.id)).toEqual(['p'])
    expect(disruptionNews(all).map((x) => x.id)).toEqual(['a', 'm', 'p'])
  })

  it('shows a saved copy only within its lifetime', () => {
    expect(savedNewsUsable(snap, NOW + NEWS_CACHE_TTL_MS - 1)).toBe(true)
    expect(savedNewsUsable(snap, NOW + NEWS_CACHE_TTL_MS)).toBe(false)
    expect(savedNewsUsable(null, NOW)).toBe(false)
  })

  it('writes relative times', () => {
    expect(relTime(NOW - 15 * 60_000, NOW)).toBe('15m ago')
    expect(relTime(NOW - 3 * 3_600_000, NOW)).toBe('3h ago')
    expect(relTime(NOW - 50 * 3_600_000, NOW)).toBe('2d ago')
    expect(relTime(NOW + 5000, NOW)).toBe('just now')
    expect(isSafeArticleUrl('https://a.ph/x')).toBe(true)
    expect(isSafeArticleUrl('http://a.ph/x')).toBe(false)
  })
})
