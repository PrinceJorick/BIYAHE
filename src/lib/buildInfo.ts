// Safe configuration and build info: what is set and which build this is, never a secret value. Shown on the
// Settings screen (About this build) and logged once at start, so two environments (one where routes work, one where they do not)
// can be compared by reading one line each.
import { CAMPUS_KEY } from '../campuses/active'
import { GOOGLE_MAP_ID, GOOGLE_MAPS_KEY } from './googleRoutes'
import { DB_VERSION } from './idb'
import { configured as supabaseConfigured } from './supabase'
import { WALK_ROUTE_VERSION, WALK_ROUTER_URL } from './walkRoute'
import { WEATHER_BROWSER_KEY } from './weather'

export type BuildInfo = {
  build: string
  supabase: 'present' | 'missing'
  walkRouter: 'configured' | 'default' | 'off'
  googleMaps: string
  news: string
  weather: string
  dataVersions: string
}

const build = typeof __BUILD__ === 'undefined' ? { commit: 'test', dirty: false, builtAt: '' } : __BUILD__

export function buildInfo(): BuildInfo {
  const env = import.meta.env.VITE_WALK_ROUTER_URL
  return {
    build: `${build.commit}${build.dirty ? '+local changes' : ''}${build.builtAt ? ` · built ${build.builtAt.slice(0, 16).replace('T', ' ')} UTC` : ''}`,
    supabase: supabaseConfigured ? 'present' : 'missing',
    walkRouter: WALK_ROUTER_URL ? (env === undefined ? 'default' : 'configured') : 'off',
    googleMaps: GOOGLE_MAPS_KEY ? `key present${GOOGLE_MAP_ID ? ', Map ID present' : ', default muted style'}` : 'key missing (OpenStreetMap map, estimated traffic)',
    news: 'server-side /api/news (Currents News API; key on the server only)',
    weather: WEATHER_BROWSER_KEY
      ? `browser → Google Weather API (${import.meta.env.VITE_GOOGLE_WEATHER_API_KEY?.trim() ? 'weather key present' : 'shared Maps key'})`
      : 'server-side /api/weather (no browser weather key in this build)',
    dataVersions: `IndexedDB v${DB_VERSION} · walking routes v${WALK_ROUTE_VERSION} · campus key "${CAMPUS_KEY}"`,
  }
}

export function logBuildInfo() {
  const d = buildInfo()
  console.info(`[biyahe] build ${d.build} · Google Maps: ${d.googleMaps} · Supabase configuration: ${d.supabase} · walking router: ${d.walkRouter} · ${d.dataVersions}`)
}
