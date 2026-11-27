import { useEffect, useState, useSyncExternalStore } from 'react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import { advisoryId, CAMPUS, corridors, fixture, spotSeeds, type Amenity, type Snapshot, type Spot, type Weather } from '../data'
import * as adv from './advisories'
import { cachedGoogleRoute, GOOGLE_ROUTES_KEY, type LiveRoute } from './googleRoutes'
import { idbClearAll, idbDelete, idbGet, idbSet, ROUTES } from './idb'
import { logBuildInfo } from './buildInfo'
import { fetchNews, readNews, savedNewsUsable, type NewsSnapshot } from './news'
import { saveOfflineTiles } from './offlineTiles'
import { reconcileSnapshot } from './spotData'
import { studentNotice } from './studentNotice'
import * as remote from './supabase'
import { resolveWalkRoute, WALK_ROUTER_URL, type WalkRoute } from './walkRoute'
import { fetchWeather, weatherCacheKey } from './weather'
import { clearApiCache, isQuotaError, latestEntry } from './apiCache'
import type { Advisory } from '../types'

export type Role = 'student' | 'staff'
/** No real campus feed is connected: every route status, safe-spot count and campus advisory is demo data, whether
 * it lives on this device or is shared through Supabase. Screens label it Simulated, never Official. */
export const DEMO_DATA = true
export type StaffRole = 'DRRMO Coordinator' | 'Building Marshal' | 'Guard on Duty'
/** Staff roles and what each one does (staff access and staff Settings). */
export const STAFF_ROLES: { id: StaffRole; hint: string }[] = [
  { id: 'DRRMO Coordinator', hint: 'Advisories, route status and every safe spot' },
  { id: 'Building Marshal', hint: 'Headcount and amenities for your one building' },
  { id: 'Guard on Duty', hint: 'Headcount in and out at every safe spot' },
]

/** What each role does on the Command screen (shown to the person in that role). */
export const ROLE_TASKS: Record<StaffRole, string[]> = {
  'DRRMO Coordinator': ['Publish, update and resolve advisories', 'Set route status when you publish', 'Watch space at every safe spot'],
  'Building Marshal': ['Keep your building\'s headcount current', 'Mark power, water and food as they change', 'Other spots and advisories are view only'],
  'Guard on Duty': ['Count people in and out (±1 at the door, ±10 for groups)', 'Turn people away from a full spot to the next one', 'Amenities and advisories are view only'],
}
export type Scenario = 'clear' | 'disrupted' | 'stale' | 'offline' | 'lowbattery'
/** Which new alerts BIYAHE announces. `notify`: also as a system notification while BIYAHE is open (no push service). */
export type AlertPrefs = { routes: boolean; pagasa: boolean; classes: boolean; notify: boolean }
export const defaultAlertPrefs: AlertPrefs = { routes: true, pagasa: true, classes: true, notify: false }

export type State = {
  ready: boolean
  role: Role | null
  staffRole: StaffRole
  // The safe spot a Building Marshal looks after (null: the campus's first spot).
  staffSpotId: string | null
  corridorId: string | null
  scenario: Scenario
  // Low-Battery Mode chosen by the person; the 'lowbattery' scenario forces it on as well.
  lowBattery: boolean
  // Battery Status API reported under 20% and discharging, and the hint has not been dismissed.
  batteryHint: boolean
  online: boolean
  backend: 'supabase' | 'device'
  snapshot: Snapshot
  // When this device last stored the snapshot in IndexedDB.
  savedAt: number
  // Google Weather at the campus point; null until there is a reading (live, or the last one saved in apiCache).
  weather: Weather | null
  weatherError: string | null
  spotId: string | null
  // Walking directions to the safe spot on screen (src/lib/walkRoute.ts) and the spot being looked up.
  walk: WalkRoute | null
  walkLoading: string | null
  // Google Routes: live traffic and road geometry per route (src/lib/googleRoutes.ts); null without a key.
  traffic: TrafficSnapshot | null
  trafficError: string | null
  // Google's traffic forecast for leaving later, per route (map → When should I leave?).
  departures: Record<string, { forecast: Partial<Record<number, LiveRoute>>; fetchedAt: number }>
  // Local news from /api/news (api/news.ts).
  news: NewsSnapshot | null
  // Articles opened on this device (ids), for the unread count.
  newsRead: string[]
  alertPrefs: AlertPrefs
  // Last time every source was refreshed successfully by this device, and whether a refresh is running.
  lastSync: number | null
  syncing: boolean
  toast: { id: number; text: string; urgent: boolean } | null
}

export type TrafficSnapshot = { routes: Partial<Record<string, LiveRoute>>; fetchedAt: number }

type Prefs = Pick<State, 'role' | 'staffRole' | 'staffSpotId' | 'corridorId' | 'scenario' | 'lowBattery' | 'alertPrefs'>

const PREFS = 'biyahe-prefs'
const MIN = 60_000
// Offline copies and tab sync are per campus, so switching campus never shows another campus's data.
const SNAPSHOT_KEY = `snapshot:${ACTIVE_CAMPUS.id}`
// Older versions saved weather (Open-Meteo) and Google traffic results here; both are removed on start, because
// Google answers now live in src/lib/apiCache.ts (localStorage, at most 24 hours), not in IndexedDB.
const LEGACY_KEYS = [`weather:${ACTIVE_CAMPUS.id}`, `traffic:${ACTIVE_CAMPUS.id}`, `news:${ACTIVE_CAMPUS.id}`]
// News is the same list for every campus (relevance is worked out on the device).
const NEWS_KEY = 'news:v2'
const NEWS_READ_KEY = 'news-read'

// Each tab keeps its own copy first, so a staff tab and a student tab can sit side by side.
function readPrefs(): Partial<Prefs> {
  try {
    const prefs: Partial<Prefs> = JSON.parse(sessionStorage.getItem(PREFS) ?? localStorage.getItem(PREFS) ?? '{}')
    // A route saved for another campus does not apply here.
    if (prefs.corridorId && !corridors.some((c) => c.id === prefs.corridorId)) prefs.corridorId = null
    prefs.alertPrefs = { ...defaultAlertPrefs, ...(typeof prefs.alertPrefs === 'object' ? prefs.alertPrefs : {}) }
    return prefs
  } catch {
    return {}
  }
}

// A saved snapshot is used only if it describes this campus's routes and safe spots.
export function matchesCampus(snapshot: Snapshot) {
  const ids = (xs: string[]) => [...xs].sort().join('|')
  return ids(Object.keys(snapshot.corridors ?? {})) === ids(corridors.map((c) => c.id))
    && ids((snapshot.spots ?? []).map((x) => x.id)) === ids(spotSeeds.map((x) => x.id))
}

let state: State = {
  ready: false,
  role: null,
  staffRole: 'DRRMO Coordinator',
  staffSpotId: null,
  corridorId: null,
  scenario: 'disrupted',
  lowBattery: false,
  batteryHint: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  backend: 'device',
  snapshot: fixture('disrupted'),
  savedAt: Date.now(),
  weather: null,
  weatherError: null,
  spotId: null,
  walk: null,
  walkLoading: null,
  traffic: null,
  trafficError: null,
  departures: {},
  news: null,
  newsRead: [],
  alertPrefs: defaultAlertPrefs,
  lastSync: null,
  syncing: false,
  toast: null,
  ...readPrefs(),
}

const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  try {
    const { role, staffRole, staffSpotId, corridorId, scenario, lowBattery, alertPrefs } = state
    const prefs = JSON.stringify({ role, staffRole, staffSpotId, corridorId, scenario, lowBattery, alertPrefs } satisfies Prefs)
    sessionStorage.setItem(PREFS, prefs)
    localStorage.setItem(PREFS, prefs)
  } catch {
    // storage blocked: prefs last for this visit only
  }
  for (const l of listeners) l()
}

export const useApp = () => useSyncExternalStore(subscribe, () => state)
export const getState = () => state

// Re-render on a timer so "updated 2 min ago" stays honest.
export function useNow(everyMs = 30_000) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

export const isLowBattery = (s: State) => s.lowBattery || s.scenario === 'lowbattery'
export const isOffline = (s: State) => !s.online || s.scenario === 'offline'

// ── Sync ───────────────────────────────────────────────────────────────────
// Device backend: BroadcastChannel keeps the coordinator tab and student tabs in step.
// Supabase backend: Realtime does the same across devices. Both paths end in receive().

const bc = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`biyahe-sync:${ACTIVE_CAMPUS.id}`)
// Updates that arrive while the Offline scenario is simulated; applied on "reconnect".
let held: Snapshot | null = null
let toastTimer: ReturnType<typeof setTimeout> | undefined

export function toast(text: string, urgent = false) {
  clearTimeout(toastTimer)
  set({ toast: { id: Date.now(), text, urgent } })
  toastTimer = setTimeout(() => set({ toast: null }), 6000)
}

function persist(snapshot: Snapshot) {
  const savedAt = Date.now()
  set({ snapshot, savedAt })
  void idbSet(SNAPSHOT_KEY, { snapshot, savedAt })
}

function receive(incoming: Snapshot) {
  // An older tab or an old database row may still carry renamed spots or superseded coordinates.
  const next = reconcileSnapshot(incoming, spotSeeds)
  if (state.scenario === 'offline') {
    held = next
    return
  }
  // Every screen re-renders from the new snapshot on its own; a student is also told what changed for them: their
  // route's status, a new advisory, or an update or resolution of one they were shown (src/lib/studentNotice.ts).
  const notice = state.role === 'student'
    ? studentNotice(state.snapshot, next, corridors, state.corridorId, Date.now(), (a) => wantsAlert(state.alertPrefs, a))
    : null
  persist(next)
  if (state.scenario === 'stale') set({ scenario: 'disrupted' })
  // Another device switched the shared demo: keep this device's Clear/Flooding label in step with the data.
  else if (state.scenario === 'clear' || state.scenario === 'disrupted') set({ scenario: demoFlooded(state) ? 'disrupted' : 'clear' })
  if (notice) {
    toast(notice.text, notice.urgent)
    notify(notice.text)
  }
}

const CLASS_RE = /\bclass(es)?\b|walang pasok|suspen/i

/** Whether the person asked to be told about this advisory (Settings → Alerts). */
export function wantsAlert(p: AlertPrefs, a: Pick<Advisory, 'source' | 'title' | 'body'>) {
  if (CLASS_RE.test(`${a.title} ${a.body}`)) return p.classes
  return a.source === 'PAGASA' ? p.pagasa : p.routes
}

// A system notification while the app is open, only when switched on and allowed. Not a push service.
function notify(text: string) {
  try {
    if (state.alertPrefs.notify && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      new Notification('BIYAHE', { body: text, icon: '/pwa-192.png' })
    }
  } catch {
    // not supported here
  }
}

function commit(next: Snapshot, push: () => Promise<boolean>) {
  persist(next)
  bc?.postMessage(next)
  if (remote.configured) {
    void push().then((ok) => {
      if (!ok && state.backend === 'supabase') toast('Server unreachable. Saved on this device and open tabs.')
    })
  }
}

async function pull() {
  const got = await remote.fetchSnapshot()
  if (got === 'empty') {
    // fresh project: seed it from what this device has
    set({ backend: 'supabase' })
    void remote.pushAll(state.snapshot)
  } else if (got) {
    set({ backend: 'supabase' })
    // A successful read confirms the shared data as of now, so a quiet hour with no changes never ages it into
    // "Unknown"; only failing to reach the server does (src/lib/routeStatus.ts). The Stale demo keeps its age.
    receive(state.scenario === 'stale' ? got : { ...got, updatedAt: Math.max(got.updatedAt, Date.now()) })
  } else {
    set({ backend: 'device' })
  }
}

// Weather goes through the shared cache (src/lib/apiCache.ts): a reading under 20 minutes old is reused, and a
// failure shows the last good reading as a saved copy with its original time. A failure with nothing to show is
// retried once after WEATHER_RETRY_MS (slow first connections on mobile data), except quota (429) and denied (403),
// which are never retried.
const WEATHER_RETRY_MS = 30_000
let weatherRetry: ReturnType<typeof setTimeout> | undefined

async function refreshWeather({ retry = true, manual = false } = {}): Promise<boolean> {
  if (!navigator.onLine || state.scenario === 'offline') return false
  clearTimeout(weatherRetry)
  try {
    const r = await fetchWeather(ACTIVE_CAMPUS.id, { manual })
    const stale = r.source === 'stale'
    set({ weather: { ...r.data, live: r.data.live && !stale }, weatherError: stale ? r.error ?? 'Weather unavailable' : null })
    return !stale
  } catch (e) {
    set({ weather: state.weather ? { ...state.weather, live: false } : null, weatherError: (e as Error).message || 'Weather unavailable' })
    if (retry && !isQuotaError(e)) weatherRetry = setTimeout(() => void refreshWeather({ retry: false }), WEATHER_RETRY_MS)
    return false
  }
}

// Demo feed (no campus database): the simulated sources re-confirm the routes at every check, as a live feed
// would, so an open demo never drifts into "Unknown". The Stale scenario is how to show old data.
function confirmDemoFeed() {
  if (remote.configured || isOffline(state) || (state.scenario !== 'clear' && state.scenario !== 'disrupted')) return
  persist({ ...state.snapshot, updatedAt: Date.now() })
}

let started = false

export async function init() {
  if (started) return
  started = true
  logBuildInfo()

  const stored = await idbGet<{ snapshot: Snapshot; savedAt: number }>(SNAPSHOT_KEY)
  for (const k of LEGACY_KEYS) void idbDelete(k)
  const news = readNews(await idbGet(NEWS_KEY))
  const newsRead = await idbGet<string[]>(NEWS_READ_KEY)
  // Saved copies keep their occupancy, amenities, advisories and route status; safe-spot names, positions and
  // capacities always come from the current registry (src/lib/spotData.ts).
  const saved = stored?.snapshot?.corridors ? { ...stored, snapshot: reconcileSnapshot(stored.snapshot, spotSeeds) } : null
  if (saved && matchesCampus(saved.snapshot)) {
    set({ snapshot: saved.snapshot, savedAt: saved.savedAt })
    void idbSet(SNAPSHOT_KEY, saved)
  } else void idbSet(SNAPSHOT_KEY, { snapshot: state.snapshot, savedAt: state.savedAt })
  // A saved news list is shown offline only while it is younger than NEWS_CACHE_TTL_MS; older copies are removed.
  if (news && savedNewsUsable(news, Date.now())) set({ news })
  else void idbDelete(NEWS_KEY)
  if (Array.isArray(newsRead)) set({ newsRead: newsRead.filter((x) => typeof x === 'string').slice(-200) })
  // The last weather reading, as a saved copy with its own time, until a live one arrives (or for an offline start).
  const savedWeather = latestEntry<Weather>(weatherCacheKey(ACTIVE_CAMPUS.id))
  if (savedWeather) set({ weather: { ...savedWeather.data, live: false } })
  set({ ready: true })

  if (bc) bc.onmessage = (e: MessageEvent<Snapshot>) => receive(e.data)

  addEventListener('online', () => {
    set({ online: true })
    void pull()
    void refreshWeather()
    void refreshTraffic()
    void refreshNews()
  })
  addEventListener('offline', () => set({ online: false }))

  if (remote.configured) {
    void pull()
    let debounce: ReturnType<typeof setTimeout> | undefined
    void remote.subscribe(() => {
      clearTimeout(debounce)
      // One read after a burst of row changes (a demo switch rewrites many rows at once).
      debounce = setTimeout(() => void pull(), 600)
    })
  }

  confirmDemoFeed()
  void refreshWeather()
  void refreshTraffic()
  void refreshNews()
  // Street tiles for the offline map: a small set for every campus and its routes, at most once a week.
  if (!isOffline(state) && !isLowBattery(state)) void saveOfflineTiles()
  // Low-Battery Mode polls the network half as often (and never asks for traffic).
  let tick = 0
  setInterval(() => {
    // A hidden tab never polls; when it is shown again the next tick asks, and the cache answers anything still fresh.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (isLowBattery(state) && tick++ % 2) return
    confirmDemoFeed()
    if (remote.configured && !isOffline(state)) void pull()
    void refreshWeather()
    void refreshTraffic()
    void refreshNews()
  }, 10 * MIN)

  // Battery Status API (Chromium). Suggests Low-Battery Mode; never switches it on silently.
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void }> }
  if (nav.getBattery) {
    try {
      const b = await nav.getBattery()
      const check = () => set({ batteryHint: b.level < 0.2 && !b.charging && !state.lowBattery })
      check()
      b.addEventListener('levelchange', check)
      b.addEventListener('chargingchange', check)
    } catch {
      // not permitted: the manual toggle still works
    }
  }
}

// ── Traffic (Google Routes) and news ────────────────────────────────────────
// Traffic: one traffic-aware route per corridor, campus → the town at the end of its path. Only with a Google key,
// online and outside Low-Battery Mode. Requests go through the shared cache (src/lib/googleRoutes.ts
// cachedGoogleRoute): reused for 10 minutes, a manual refresh at most every 30 seconds, and the last good route as
// a fallback that src/lib/traffic.ts never shows as live once older than LIVE_FRESH_MS.

let trafficBusy = false

const destination = (id: string) => corridors.find((c) => c.id === id)?.path.at(-1)

export async function refreshTraffic(force = false) {
  if (!GOOGLE_ROUTES_KEY || isOffline(state) || isLowBattery(state) || trafficBusy) return
  trafficBusy = true
  try {
    const results = await Promise.allSettled(corridors.map((c) =>
      cachedGoogleRoute({ campusId: ACTIVE_CAMPUS.id, destinationId: c.id }, CAMPUS, c.path.at(-1)!, { manual: force })))
    const routes: TrafficSnapshot['routes'] = {}
    let error: string | null = null
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        routes[corridors[i].id] = r.value.data
        if (r.value.error) error ??= r.value.error
      } else error ??= (r.reason as Error).message
    })
    const ids = Object.keys(routes)
    // Same answers as on screen (a cache hit): no state change, so no re-render and no map redraw.
    const same = state.traffic && ids.length === Object.keys(state.traffic.routes).length
      && ids.every((id) => state.traffic!.routes[id]?.fetchedAt === routes[id]!.fetchedAt)
    if (ids.length && !same) {
      // fetchedAt is when Google answered (the newest route), never the time a cached copy was read.
      set({ traffic: { routes, fetchedAt: Math.max(...ids.map((id) => routes[id]!.fetchedAt)) }, trafficError: error })
    } else if (!ids.length || error !== state.trafficError) {
      set({ trafficError: error })
      if (!ids.length && error) console.warn(`[biyahe] Live traffic unavailable: ${error}`)
    }
  } finally {
    trafficBusy = false
  }
}

const FORECAST_OFFSETS = [30, 60, 120]

/** Google's traffic forecast for leaving in 30 min, 1 h and 2 h on one route (cached 10 minutes per departure). */
export async function loadDepartures(corridorId: string) {
  const to = destination(corridorId)
  if (!to || !GOOGLE_ROUTES_KEY || isOffline(state) || isLowBattery(state)) return
  const now = Date.now()
  const results = await Promise.allSettled(FORECAST_OFFSETS.map((m) =>
    cachedGoogleRoute({ campusId: ACTIVE_CAMPUS.id, destinationId: corridorId, departInMin: m }, CAMPUS, to)))
  const forecast: Partial<Record<number, LiveRoute>> = {}
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') forecast[FORECAST_OFFSETS[i]] = r.value.data
  })
  const cur = state.departures[corridorId]?.forecast
  if (cur && FORECAST_OFFSETS.every((m) => cur[m]?.fetchedAt === forecast[m]?.fetchedAt)) return
  set({ departures: { ...state.departures, [corridorId]: { forecast, fetchedAt: now } } })
}

// After a provider rate limit, no news request is made before this time (no retry loop).
let newsRetryAt = 0
let newsBusy: Promise<boolean> | null = null

export function refreshNews(): Promise<boolean> {
  if (isOffline(state) || isLowBattery(state) || Date.now() < newsRetryAt) return Promise.resolve(false)
  newsBusy ??= (async () => {
    try {
      const news = await fetchNews()
      if (news.retryAfter) newsRetryAt = Date.now() + news.retryAfter * 1000
      // A provider error keeps the last good list on screen, marked with the error.
      if (news.error && state.news?.items.length) set({ news: { ...state.news, error: news.error } })
      else {
        set({ news })
        if (!news.error) void idbSet(NEWS_KEY, news)
      }
      return !news.error
    } catch (e) {
      const error = (e as Error).message || 'news unavailable'
      set({ news: state.news ? { ...state.news, error } : { items: [], provider: 'none', fetchedAt: 0, error } })
      return false
    } finally {
      newsBusy = null
    }
  })()
  return newsBusy
}

export function markNewsRead(id: string) {
  if (state.newsRead.includes(id)) return
  const newsRead = [...state.newsRead, id].slice(-200)
  set({ newsRead })
  void idbSet(NEWS_READ_KEY, newsRead)
}

// ── Actions ────────────────────────────────────────────────────────────────

export function chooseRole(role: Role | null) {
  set({ role })
}

export function setStaffRole(staffRole: StaffRole) {
  set({ staffRole })
}

export function setStaffSpot(staffSpotId: string) {
  set({ staffSpotId })
}

export function setCorridor(corridorId: string) {
  set({ corridorId })
}

export function setLowBattery(lowBattery: boolean) {
  set({ lowBattery, batteryHint: false, scenario: !lowBattery && state.scenario === 'lowbattery' ? 'disrupted' : state.scenario })
  toast(lowBattery ? 'Low-Battery Mode on. OpenStreetMap, no live traffic.' : 'Low-Battery Mode off.')
}

export function dismissBatteryHint() {
  set({ batteryHint: false })
}

export function selectSpot(spotId: string | null) {
  set({ spotId })
}

// ── Walking route to a safe spot ────────────────────────────────────────────
// One lookup per spot shown. A newer request always wins (a slow answer for a spot the student has moved away
// from is dropped). Never leaves a loading state behind: resolveWalkRoute never throws and has its own timeout.
let walkRequest = 0

export async function loadWalkRoute(spot: Pick<Spot, 'id' | 'pos'> | undefined) {
  if (!spot) {
    walkRequest++
    if (state.walk || state.walkLoading) set({ walk: null, walkLoading: null })
    return
  }
  const allowNetwork = Boolean(WALK_ROUTER_URL) && !isOffline(state) && !isLowBattery(state)
  const cur = state.walk
  // Nothing better to get: a live route is current, or there is no network to improve on what is shown.
  if (cur?.spotId === spot.id && (cur.mode === 'live' || !allowNetwork)) return
  if (state.walkLoading === spot.id) return
  const id = ++walkRequest
  set({ walkLoading: spot.id })
  const route = await resolveWalkRoute(spot.id, CAMPUS, spot.pos, {
    allowNetwork,
    cacheGet: (k) => idbGet(k, ROUTES),
    cacheSet: (k, v) => idbSet(k, v, ROUTES),
  })
  if (id !== walkRequest) return
  set({ walk: route, walkLoading: null })
}

// Demo scenarios Clear and Flooding change the shared demo data: this device, its open tabs and, with Supabase,
// every device on the campus (so a presenter can flood the routes on every phone at once). The campus data is demo
// data only (DEMO_DATA); with a real feed this must stop writing. Stale, Offline and Low battery stay on this device.
function simulate(next: Snapshot, share = true) {
  persist(next)
  bc?.postMessage(next)
  if (share && remote.configured) void remote.pushAll(next).then((ok) => { if (!ok) toast('Server unreachable. Demo changed on this device only.') })
}

/** Map toggle (demo only): Flooding when any route is closed or slow by a hazard, otherwise Clear. */
export const demoFlooded = (s: Pick<State, 'snapshot'>) => Object.values(s.snapshot.corridors).some((c) => c.status !== 'open')

export function setScenario(scenario: Scenario) {
  const wasOffline = state.scenario === 'offline'
  set({ scenario })
  const now = Date.now()
  if (scenario === 'clear' || scenario === 'disrupted') {
    held = null
    simulate(fixture(scenario, now))
  } else if (scenario === 'stale') {
    held = null
    simulate({ ...fixture('disrupted', now), updatedAt: now - 38 * MIN }, false)
  } else if (wasOffline && held) {
    const next = held
    held = null
    receive(next)
  }
}

/**
 * Settings → Sync now: weather, traffic, news and (with Supabase) shared data, once. lastSync is set only when
 * every source that could be asked answered. Returns what happened, for the toast.
 */
export async function syncNow(): Promise<'ok' | 'partial' | 'offline' | 'busy'> {
  if (state.syncing) return 'busy'
  if (isOffline(state)) return 'offline'
  set({ syncing: true })
  try {
    const [w, n] = await Promise.all([refreshWeather({ retry: false, manual: true }), refreshNews(), refreshTraffic(true), remote.configured ? pull() : Promise.resolve()])
    const ok = w && (n || isLowBattery(state))
    if (ok) set({ lastSync: Date.now() })
    return ok ? 'ok' : 'partial'
  } finally {
    set({ syncing: false })
  }
}

/** Settings → Clear offline data: BIYAHE's own IndexedDB stores only. Preferences stay; the app reloads its data. */
export async function clearOfflineData() {
  await idbClearAll()
  clearApiCache()
  set({ news: null, newsRead: [], walk: null })
  const now = Date.now()
  persist(fixture(state.scenario === 'clear' ? 'clear' : 'disrupted', now))
  void syncNow()
}

/** Home → Retry: one manual weather request (subject to the one-minute cooldown). */
export const retryWeather = () => refreshWeather({ retry: false, manual: true })

export function setAlertPrefs(patch: Partial<AlertPrefs>) {
  set({ alertPrefs: { ...state.alertPrefs, ...patch } })
}

// Asks the backend for anything newer. Returns false when there is nothing to ask.
export async function refresh(): Promise<boolean> {
  void refreshWeather({ manual: true })
  void refreshTraffic(true)
  void refreshNews()
  if (!remote.configured || isOffline(state)) return false
  await pull()
  return true
}

// ── Staff permissions on safe spots ─────────────────────────────────────────
// DRRMO Coordinator: every spot. Building Marshal: headcount and amenities of their one building. Guard on Duty:
// headcount at every spot, no amenities (they move between the gate and the spots but do not run the facilities).
// UI gating for the demo only: there is no staff sign-in yet.

/** The Building Marshal's building: their choice if it is on this campus, otherwise the campus's first spot. */
export const marshalSpotId = (s: Pick<State, 'staffSpotId'>) =>
  spotSeeds.some((x) => x.id === s.staffSpotId) ? s.staffSpotId! : spotSeeds[0]?.id ?? null

type Who = Pick<State, 'role' | 'staffRole' | 'staffSpotId'>
export function canEditOccupancy(s: Who, spotId: string) {
  if (s.role !== 'staff') return false
  return s.staffRole === 'Building Marshal' ? marshalSpotId(s) === spotId : true
}
export function canEditAmenities(s: Who, spotId: string) {
  if (s.role !== 'staff' || s.staffRole === 'Guard on Duty') return false
  return s.staffRole === 'Building Marshal' ? marshalSpotId(s) === spotId : true
}

export function adjustOccupancy(spotId: string, delta: number) {
  if (!canEditOccupancy(state, spotId)) return toast('Your role cannot change this spot\'s headcount.')
  const spots = state.snapshot.spots.map((s) =>
    s.id === spotId ? { ...s, occupied: Math.min(s.capacity ?? Infinity, Math.max(0, s.occupied + delta)) } : s,
  )
  const spot = spots.find((s) => s.id === spotId)!
  commit({ ...state.snapshot, spots, updatedAt: Date.now() }, () => remote.pushSpot(spot))
}

export function toggleAmenity(spotId: string, amenity: Amenity) {
  if (!canEditAmenities(state, spotId)) return toast('Your role cannot change this spot\'s amenities.')
  const spots = state.snapshot.spots.map((s) =>
    s.id === spotId ? { ...s, amenities: { ...s.amenities, [amenity]: !s.amenities[amenity] } } : s,
  )
  const spot = spots.find((s) => s.id === spotId)!
  commit({ ...state.snapshot, spots, updatedAt: Date.now() }, () => remote.pushSpot(spot))
}

// ── Campus advisories (coordinator) ─────────────────────────────────────────
// Every change goes through the same path as the rest of the shared state: the snapshot on this device,
// BroadcastChannel to open tabs, and an upsert of the one advisory row (plus its corridor, if changed) to
// Supabase. IDs are fixed when an advisory is created, so publishing or editing never creates a second row.
// Nothing is deleted: resolved advisories stay in the record.

/** Only the DRRMO Coordinator manages campus advisories. Building marshals and guards see them read-only. */
export const canManageAdvisories = (s: Pick<State, 'role' | 'staffRole'>) => s.role === 'staff' && s.staffRole === 'DRRMO Coordinator'

const NOT_ALLOWED = 'Only the DRRMO Coordinator can change advisories.'
const newAdvisoryId = (now: number) => advisoryId(`campus-${now}-${Math.random().toString(36).slice(2, 8)}`)

function applyAdvisory(change: () => adv.ChangeResult, success: string): adv.ChangeResult {
  if (!canManageAdvisories(state)) {
    toast(NOT_ALLOWED)
    return { ok: false, error: NOT_ALLOWED }
  }
  const result = change()
  if (!result.ok) return result
  const { snapshot: next, advisory, corridorChanged } = result
  commit(next, async () => {
    const a = await remote.pushAdvisory(advisory)
    const c = corridorChanged ? await remote.pushCorridor(corridorChanged, next.corridors[corridorChanged]) : true
    return a && c
  })
  toast(success)
  return result
}

const issuer = () => `Campus DRRMO · ${state.staffRole}`

export function createAdvisory(input: adv.AdvisoryInput, { publish }: { publish: boolean }) {
  const now = Date.now()
  return applyAdvisory(
    () => adv.createAdvisory(state.snapshot, input, { id: newAdvisoryId(now), now, issuer: issuer(), publish, corridors }),
    publish ? 'Published. Students see it now.' : 'Draft saved. Hidden from students.',
  )
}

export function editAdvisory(id: string, input: adv.AdvisoryInput) {
  const wasDraft = state.snapshot.advisories.find((a) => a.id === id)?.status === 'draft'
  return applyAdvisory(
    () => adv.updateAdvisory(state.snapshot, id, input, { now: Date.now(), corridors }),
    wasDraft ? 'Draft saved. Hidden from students.' : 'Updated. Students see the new version.',
  )
}

export function publishDraft(id: string) {
  return applyAdvisory(() => adv.publishAdvisory(state.snapshot, id, { now: Date.now() }), 'Published. Students see it now.')
}

export function resolveAdvisory(id: string, opts: { reopenCorridor?: boolean } = {}) {
  const wasDraft = state.snapshot.advisories.find((a) => a.id === id)?.status === 'draft'
  return applyAdvisory(
    () => adv.resolveAdvisory(state.snapshot, id, { now: Date.now(), reopenCorridor: opts.reopenCorridor }),
    wasDraft ? 'Draft discarded. Students never saw it.' : 'Resolved. Students no longer see it.',
  )
}
