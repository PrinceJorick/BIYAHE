// Safe configuration and build info: what is set and which build this is, never a secret value. Shown on the
// Profile screen and logged once at start, so two environments (one where routes work, one where they do not)
// can be compared by reading one line each.
import { CAMPUS_KEY } from '../campuses/active'
import { DB_VERSION } from './idb'
import { configured as supabaseConfigured } from './supabase'
import { WALK_ROUTE_VERSION, WALK_ROUTER_URL } from './walkRoute'

export type BuildInfo = {
  build: string
  supabase: 'present' | 'missing'
  walkRouter: 'configured' | 'default' | 'off'
  tiles: string
  dataVersions: string
}

const build = typeof __BUILD__ === 'undefined' ? { commit: 'test', dirty: false, builtAt: '' } : __BUILD__

export function buildInfo(): BuildInfo {
  const env = import.meta.env.VITE_WALK_ROUTER_URL
  return {
    build: `${build.commit}${build.dirty ? '+local changes' : ''}${build.builtAt ? ` · built ${build.builtAt.slice(0, 16).replace('T', ' ')} UTC` : ''}`,
    supabase: supabaseConfigured ? 'present' : 'missing',
    walkRouter: WALK_ROUTER_URL ? (env === undefined ? 'default' : 'configured') : 'off',
    tiles: 'OpenStreetMap standard tiles (built in)',
    dataVersions: `IndexedDB v${DB_VERSION} · walking routes v${WALK_ROUTE_VERSION} · campus key "${CAMPUS_KEY}"`,
  }
}

export function logBuildInfo() {
  const d = buildInfo()
  console.info(`[biyahe] build ${d.build} · Supabase configuration: ${d.supabase} · walking router: ${d.walkRouter} · ${d.dataVersions}`)
}
