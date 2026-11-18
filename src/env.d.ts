// Build-time constants and the environment variables the app reads (all optional).

interface ImportMetaEnv {
  /** Supabase project URL. Unset: the app runs on device data (IndexedDB + cross-tab sync). */
  readonly VITE_SUPABASE_URL?: string
  /** Supabase anon (public) key. */
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** OSRM-compatible walking router base URL. Unset: FOSSGIS public foot router. Empty string: live walking routes off. */
  readonly VITE_WALK_ROUTER_URL?: string
}

/** Stamped by vite.config.ts: which code this build is, for comparing two environments. */
declare const __BUILD__: { commit: string; dirty: boolean; builtAt: string }
