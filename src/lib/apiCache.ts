// Shared cache for Google Weather and Google Routes answers: one network request per key at a time, a fresh-for
// window (TTL), a manual-refresh cooldown, and the last good answer kept as a fallback when a request fails
// (quota 429, denied 403, network). Persistent in localStorage (namespaced, versioned); an in-memory Map stands in
// when storage is missing or throws (private windows, the Vercel Function). IndexedDB snapshots (store.ts) are
// separate and unchanged: this only decides whether to call an API again.
//
// shortcut: entries older than MAX_KEEP_MS are dropped (Google Maps Platform content is not kept indefinitely);
// raise it only if the provider terms allow longer storage.

export type CacheEntry<T> = { data: T; fetchedAt: number; expiresAt: number }
/** network = just fetched; cache = within TTL; stale = an older answer returned because the request failed or is cooling down. */
export type Cached<T> = CacheEntry<T> & { source: 'network' | 'cache' | 'stale'; error?: string }

/** An HTTP failure with its status, so callers can tell quota (429) and denial (403) from other errors. */
export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
/** 429 (quota / rate limit) and 403 (denied): retrying will not help, so callers must not retry. */
export const isQuotaError = (e: unknown) => e instanceof HttpError && (e.status === 429 || e.status === 403)

const PREFIX = 'biyahe-api:v1:'
const COOLDOWN = 'cooldown:'
const MAX_ENTRIES = 64
const MAX_KEEP_MS = 24 * 3_600_000

const memory = new Map<string, string>()
const inflight = new Map<string, Promise<Cached<unknown>>>()

// The Web Storage calls used here (typed locally: the server build has no DOM types).
type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; key(i: number): string | null; readonly length: number }

function storage(): KV | null {
  try {
    // Browser only: on the server (Vercel Function, Node) the memory Map is the cache.
    return (globalThis as { window?: { localStorage?: KV } }).window?.localStorage ?? null
  } catch {
    return null
  }
}

function getRaw(k: string): string | null {
  try {
    const v = storage()?.getItem(k)
    if (v != null) return v
  } catch {
    // blocked storage: memory below
  }
  return memory.get(k) ?? null
}

function setRaw(k: string, v: string) {
  memory.set(k, v)
  try {
    storage()?.setItem(k, v)
  } catch {
    // quota or blocked: the memory copy serves this visit
  }
}

function removeRaw(k: string) {
  memory.delete(k)
  try {
    storage()?.removeItem(k)
  } catch {
    // nothing to do
  }
}

function keys(): string[] {
  const out = new Set([...memory.keys()].filter((k) => k.startsWith(PREFIX)))
  try {
    const s = storage()
    for (let i = 0; s && i < s.length; i++) {
      const k = s.key(i)
      if (k?.startsWith(PREFIX)) out.add(k)
    }
  } catch {
    // memory keys only
  }
  return [...out]
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function read<T>(key: string): CacheEntry<T> | null {
  const raw = getRaw(PREFIX + key)
  if (!raw) return null
  try {
    const e = JSON.parse(raw) as CacheEntry<T>
    if (e && 'data' in e && finite(e.fetchedAt) && finite(e.expiresAt)) return e
  } catch {
    // malformed: dropped below
  }
  removeRaw(PREFIX + key)
  return null
}

/** Drops entries past MAX_KEEP_MS, then the oldest beyond MAX_ENTRIES. Cooldown marks expire on their own. */
function prune(now: number) {
  const entries = keys().filter((k) => !k.startsWith(PREFIX + COOLDOWN)).map((k) => {
    try {
      return { k, at: (JSON.parse(getRaw(k) ?? '') as CacheEntry<unknown>).fetchedAt }
    } catch {
      return { k, at: -Infinity }
    }
  })
  const keep = entries.filter((e) => finite(e.at) && now - e.at < MAX_KEEP_MS).sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES)
  for (const e of entries) if (!keep.includes(e)) removeRaw(e.k)
}

/** The entry when still within its TTL, else null. */
export function freshEntry<T>(key: string, now = Date.now()): CacheEntry<T> | null {
  const e = read<T>(key)
  return e && now < e.expiresAt ? e : null
}

/** The latest entry, expired or not (stale fallback), within MAX_KEEP_MS. */
export function latestEntry<T>(key: string, now = Date.now()): CacheEntry<T> | null {
  const e = read<T>(key)
  return e && now - e.fetchedAt < MAX_KEEP_MS ? e : null
}

/** Stores a successful answer. Never called for failures, so an error never replaces good data. */
export function putEntry<T>(key: string, data: T, ttlMs: number, now = Date.now()): CacheEntry<T> {
  const e = { data, fetchedAt: now, expiresAt: now + ttlMs }
  setRaw(PREFIX + key, JSON.stringify(e))
  prune(now)
  return e
}

export function cooldownActive(key: string, cooldownMs: number, now = Date.now()) {
  const at = Number(getRaw(PREFIX + COOLDOWN + key))
  return finite(at) && at > 0 && now - at < cooldownMs
}

export function markCooldown(key: string, now = Date.now()) {
  setRaw(PREFIX + COOLDOWN + key, String(now))
}

/** For tests and Settings → Clear offline data. */
export function clearApiCache() {
  for (const k of keys()) removeRaw(k)
  memory.clear()
  inflight.clear()
}

export type RequestOptions<T> = {
  key: string
  ttlMs: number
  cooldownMs: number
  fetcher: () => Promise<T>
  /** A manual refresh: skips a fresh entry, at most once per cooldown. */
  manual?: boolean
  now?: () => number
}

/**
 * The one request boundary. Order: a request already in flight for the key (the same Promise, so concurrent
 * callers share it) → a fresh entry (no request) → a cooldown-blocked manual refresh (latest entry, no request) →
 * the network. A failed request returns the latest entry marked stale with its original fetchedAt; with no entry
 * it rejects, and the caller keeps its existing fallback. Not async: an async wrapper would hand each caller a
 * different Promise.
 */
export function cachedRequest<T>(o: RequestOptions<T>): Promise<Cached<T>> {
  const running = inflight.get(o.key) as Promise<Cached<T>> | undefined
  if (running) return running
  const now = (o.now ?? Date.now)()
  const fresh = freshEntry<T>(o.key, now)
  const cooling = o.manual && cooldownActive(o.key, o.cooldownMs, now)
  if (fresh && (!o.manual || cooling)) return Promise.resolve({ ...fresh, source: 'cache' })
  if (cooling) {
    const latest = latestEntry<T>(o.key, now)
    return latest ? Promise.resolve({ ...latest, source: 'stale' }) : Promise.reject(new Error('refresh cooling down'))
  }
  if (o.manual) markCooldown(o.key, now)
  let p: Promise<Cached<T>>
  try {
    p = o.fetcher().then(
      (data) => ({ ...putEntry(o.key, data, o.ttlMs, (o.now ?? Date.now)()), source: 'network' as const }),
      (err: unknown) => {
        const latest = latestEntry<T>(o.key, (o.now ?? Date.now)())
        if (latest) return { ...latest, source: 'stale' as const, error: (err as Error)?.message ?? 'request failed' }
        throw err
      },
    )
  } catch (e) {
    p = Promise.reject(e)
  }
  inflight.set(o.key, p as Promise<Cached<unknown>>)
  // Only this request's own entry is removed, never a newer one registered under the same key.
  const done = () => {
    if (inflight.get(o.key) === p) inflight.delete(o.key)
  }
  p.then(done, done)
  return p
}
