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
