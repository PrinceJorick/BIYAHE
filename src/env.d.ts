// Build-time constants and the environment variables the app reads (all optional; see .env.example).

interface ImportMetaEnv {
  /** Google Maps Platform browser key (Maps JavaScript API + Routes API). Unset: simple offline map, estimated traffic. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** Optional Google Map ID for a cloud-styled vector map. Unset: built-in muted raster style. */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
  /** Supabase project URL. Unset: the app runs on device data (IndexedDB + cross-tab sync). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon (public) key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** OSRM-compatible walking router base URL. Unset: FOSSGIS public foot router. Empty string: live walking routes off. */
  readonly VITE_WALK_ROUTER_URL?: string
}

/** Stamped by vite.config.ts: which code this build is, for comparing two environments. */
declare const __BUILD__: { commit: string; dirty: boolean; builtAt: string }
