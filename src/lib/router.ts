import { useSyncExternalStore } from 'react'

export type Route = 'welcome' | 'setup' | 'home' | 'map' | 'share' | 'alerts' | 'profile' | 'staff' | 'coordinator'

const routes: Route[] = ['welcome', 'setup', 'home', 'map', 'share', 'alerts', 'profile', 'staff', 'coordinator']

const read = (): Route | null => {
  const r = location.hash.replace(/^#\/?/, '') as Route
  return routes.includes(r) ? r : null
}

const subscribe = (l: () => void) => {
  addEventListener('hashchange', l)
  return () => removeEventListener('hashchange', l)
}

export const useRoute = () => useSyncExternalStore(subscribe, read)

// Path-style links some people type or share (/map, /safespots, /coordinator/) name the same screens.
const aliases: Record<string, Route> = { safespots: 'map', 'safe-spots': 'map', 'where-to-wait': 'map' }

/**
 * The app routes with the hash (#/map), so any host serves it from one index.html. A path-style deep link is
 * rewritten to its hash route on load; an unknown path goes to the start ('#/'), where the role rules apply.
 * Returns null when nothing needs changing (already on '/', or a hash route is present).
 */
export function entryHash(pathname: string, hash: string): string | null {
  if (hash && hash !== '#' && hash !== '#/') return null
  const seg = pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!seg || seg === 'index.html') return null
  const r = aliases[seg] ?? (routes.includes(seg as Route) ? (seg as Route) : null)
  return r ? `#/${r}` : '#/'
}

export function normalizeEntryPath() {
  const h = entryHash(location.pathname, location.hash)
  if (h != null) history.replaceState(null, '', `/${location.search}${h}`)
}

export const go = (r: Route) => {
  location.hash = `/${r}`
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
