import { useMemo, useSyncExternalStore } from 'react'

// Screens. Student: home → go (details for one place) → map; alerts; share. Setup holds campus, route and app
// settings (the old Profile screen is gone). Staff: staff access → coordinator.
export type Route = 'welcome' | 'setup' | 'home' | 'go' | 'map' | 'share' | 'alerts' | 'staff' | 'coordinator'

const routes: Route[] = ['welcome', 'setup', 'home', 'go', 'map', 'share', 'alerts', 'staff', 'coordinator']

/** A parsed hash route: `#/go/route/lipa` → { name: 'go', arg: 'route/lipa' }. */
export type Loc = { name: Route | null; arg: string | null }

// Older and path-style names for the same screens (/safespots, #/profile, …).
const aliases: Record<string, Route> = {
  safespots: 'map', 'safe-spots': 'map', 'where-to-wait': 'map', profile: 'setup', settings: 'setup',
}

const known = (seg: string): Route | null => aliases[seg] ?? (routes.includes(seg as Route) ? (seg as Route) : null)

export function parseHash(hash: string): Loc {
  const [head = '', ...rest] = hash.replace(/^#\/?/, '').split('/')
  const name = known(head.toLowerCase())
  const arg = rest.filter(Boolean).map(decodeURIComponent).join('/')
  return { name, arg: name && arg ? arg : null }
}

const subscribe = (l: () => void) => {
  addEventListener('hashchange', l)
  return () => removeEventListener('hashchange', l)
}

export function useRoute(): Loc {
  const hash = useSyncExternalStore(subscribe, () => location.hash)
  return useMemo(() => parseHash(hash), [hash])
}

export const hrefOf = (name: Route, arg?: string | null) => `#/${name}${arg ? `/${arg}` : ''}`

/**
 * The app routes with the hash (#/map), so any host serves it from one index.html. A path-style deep link is
 * rewritten to its hash route on load; an unknown path goes to the start ('#/'), where the role rules apply.
 * Returns null when nothing needs changing (already on '/', or a hash route is present).
 */
export function entryHash(pathname: string, hash: string): string | null {
  if (hash && hash !== '#' && hash !== '#/') return null
  const seg = pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!seg || seg === 'index.html') return null
  const [head, ...rest] = seg.split('/')
  const r = known(head)
  return r ? hrefOf(r, rest.join('/') || null) : '#/'
}

export function normalizeEntryPath() {
  const h = entryHash(location.pathname, location.hash)
  if (h != null) history.replaceState(null, '', `/${location.search}${h}`)
}

export const go = (r: Route, arg?: string | null) => {
  location.hash = hrefOf(r, arg).slice(1)
}

export function useMedia(query: string) {
  return useSyncExternalStore(
    (l) => {
      const m = matchMedia(query)
      m.addEventListener('change', l)
      return () => m.removeEventListener('change', l)
    },
    () => matchMedia(query).matches,
  )
}
