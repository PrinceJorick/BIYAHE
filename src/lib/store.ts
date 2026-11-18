import { useEffect, useState, useSyncExternalStore } from 'react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import { advisoryId, corridors, fallbackWeather, fixture, spotSeeds, type Amenity, type Snapshot, type Weather } from '../data'
import * as adv from './advisories'
import { idbGet, idbSet } from './idb'
import * as remote from './supabase'
import { fetchWeather } from './weather'

export type Role = 'student' | 'staff'
export type StaffRole = 'DRRMO Coordinator' | 'Building Marshal' | 'Guard on Duty'
export type Scenario = 'clear' | 'disrupted' | 'stale' | 'offline' | 'lowbattery'

export type State = {
  ready: boolean
  role: Role | null
  staffRole: StaffRole
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
  weather: Weather
  spotId: string | null
  toast: { id: number; text: string; urgent: boolean } | null
}

type Prefs = Pick<State, 'role' | 'staffRole' | 'corridorId' | 'scenario' | 'lowBattery'>

const PREFS = 'biyahe-prefs'
const MIN = 60_000
// Offline copies and tab sync are per campus, so switching campus never shows another campus's data.
const SNAPSHOT_KEY = `snapshot:${ACTIVE_CAMPUS.id}`
const WEATHER_KEY = `weather:${ACTIVE_CAMPUS.id}`

// Each tab keeps its own copy first, so a staff tab and a student tab can sit side by side.
function readPrefs(): Partial<Prefs> {
  try {
    const prefs: Partial<Prefs> = JSON.parse(sessionStorage.getItem(PREFS) ?? localStorage.getItem(PREFS) ?? '{}')
    // A route saved for another campus does not apply here.
    if (prefs.corridorId && !corridors.some((c) => c.id === prefs.corridorId)) prefs.corridorId = null
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
  corridorId: null,
  scenario: 'disrupted',
  lowBattery: false,
  batteryHint: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  backend: 'device',
  snapshot: fixture('disrupted'),
  savedAt: Date.now(),
  weather: fallbackWeather(),
  spotId: null,
  toast: null,
  ...readPrefs(),
}

const listeners = new Set<() => void>()
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))

function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  try {
    const { role, staffRole, corridorId, scenario, lowBattery } = state
    const prefs = JSON.stringify({ role, staffRole, corridorId, scenario, lowBattery } satisfies Prefs)
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

function receive(next: Snapshot) {
  if (state.scenario === 'offline') {
    held = next
    return
  }
  // Notify a student only about advisories that have just become current for them (newly published,
  // not drafts, edits of ones already shown, resolved or expired ones).
  const now = Date.now()
  const known = new Set(adv.studentAdvisories(state.snapshot.advisories, state.corridorId, now).map((a) => a.id))
  const fresh = adv.studentAdvisories(next.advisories, state.corridorId, now).filter((a) => !known.has(a.id))
  persist(next)
  if (state.scenario === 'stale') set({ scenario: 'disrupted' })
  if (fresh.length && state.role === 'student') {
    const a = fresh[0]
    toast(`New ${a.source === 'Campus' ? 'campus' : a.source} advisory: ${a.title}`, a.severity === 'critical')
  }
}

function commit(next: Snapshot, push: () => Promise<boolean>) {
  persist(next)
  bc?.postMessage(next)
  if (remote.configured) {
    void push().then((ok) => {
      if (!ok && state.backend === 'supabase') toast('Could not reach the server. Saved on this device and shared with open tabs.')
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
    receive(got)
  } else {
    set({ backend: 'device' })
  }
}

async function refreshWeather() {
  if (!navigator.onLine) return
  try {
    const weather = await fetchWeather()
    set({ weather })
    void idbSet(WEATHER_KEY, weather)
  } catch {
    set({ weather: { ...state.weather, live: false } })
  }
}

let started = false

export async function init() {
  if (started) return
  started = true

  const saved = await idbGet<{ snapshot: Snapshot; savedAt: number }>(SNAPSHOT_KEY)
  const weather = await idbGet<Weather>(WEATHER_KEY)
  if (saved && matchesCampus(saved.snapshot)) set({ snapshot: saved.snapshot, savedAt: saved.savedAt })
  else void idbSet(SNAPSHOT_KEY, { snapshot: state.snapshot, savedAt: state.savedAt })
  if (weather) set({ weather: { ...weather, live: false } })
  set({ ready: true })

  if (bc) bc.onmessage = (e: MessageEvent<Snapshot>) => receive(e.data)

  addEventListener('online', () => {
    set({ online: true })
    void pull()
    void refreshWeather()
  })
  addEventListener('offline', () => set({ online: false }))

  if (remote.configured) {
    void pull()
    let debounce: ReturnType<typeof setTimeout> | undefined
    void remote.subscribe(() => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void pull(), 150)
    })
  }

  void refreshWeather()
  // Low-Battery Mode polls the network half as often.
  let tick = 0
  setInterval(() => {
    if (isLowBattery(state) && tick++ % 2) return
    void refreshWeather()
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

// ── Actions ────────────────────────────────────────────────────────────────

export function chooseRole(role: Role | null) {
  set({ role })
}

export function setStaffRole(staffRole: StaffRole) {
  set({ staffRole })
}

export function setCorridor(corridorId: string) {
  set({ corridorId })
}

export function setLowBattery(lowBattery: boolean) {
  set({ lowBattery, batteryHint: false, scenario: !lowBattery && state.scenario === 'lowbattery' ? 'disrupted' : state.scenario })
  toast(lowBattery ? 'Low-Battery Mode is on. Map simplified, text first.' : 'Low-Battery Mode is off.')
}

export function dismissBatteryHint() {
  set({ batteryHint: false })
}

export function selectSpot(spotId: string | null) {
  set({ spotId })
}

export function setScenario(scenario: Scenario) {
  const wasOffline = state.scenario === 'offline'
  set({ scenario })
  const now = Date.now()
  if (scenario === 'clear' || scenario === 'disrupted') {
    held = null
    const next = fixture(scenario, now)
    commit(next, () => remote.pushAll(next))
  } else if (scenario === 'stale') {
    held = null
    const next = { ...fixture('disrupted', now), updatedAt: now - 38 * MIN }
    commit(next, () => remote.pushAll(next))
  } else if (wasOffline && held) {
    const next = held
    held = null
    receive(next)
  }
}

// Asks the backend for anything newer. Returns false when there is nothing to ask.
export async function refresh(): Promise<boolean> {
  void refreshWeather()
  if (!remote.configured || isOffline(state)) return false
  await pull()
  return true
}

export function adjustOccupancy(spotId: string, delta: number) {
  const spots = state.snapshot.spots.map((s) =>
    s.id === spotId ? { ...s, occupied: Math.min(s.capacity, Math.max(0, s.occupied + delta)) } : s,
  )
  const spot = spots.find((s) => s.id === spotId)!
  commit({ ...state.snapshot, spots, updatedAt: Date.now() }, () => remote.pushSpot(spot))
}

export function toggleAmenity(spotId: string, amenity: Amenity) {
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

const NOT_ALLOWED = 'Only the DRRMO Coordinator can create or change campus advisories.'
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
    publish ? 'Advisory published. Student views are updated.' : 'Draft saved. Students cannot see it until you publish it.',
  )
}

export function editAdvisory(id: string, input: adv.AdvisoryInput) {
  const wasDraft = state.snapshot.advisories.find((a) => a.id === id)?.status === 'draft'
  return applyAdvisory(
    () => adv.updateAdvisory(state.snapshot, id, input, { now: Date.now(), corridors }),
    wasDraft ? 'Draft updated.' : 'Advisory updated. Student views show the new version.',
  )
}

export function publishDraft(id: string) {
  return applyAdvisory(() => adv.publishAdvisory(state.snapshot, id, { now: Date.now() }), 'Advisory published. Student views are updated.')
}

export function resolveAdvisory(id: string, opts: { reopenCorridor?: boolean } = {}) {
  const wasDraft = state.snapshot.advisories.find((a) => a.id === id)?.status === 'draft'
  return applyAdvisory(
    () => adv.resolveAdvisory(state.snapshot, id, { now: Date.now(), reopenCorridor: opts.reopenCorridor }),
    wasDraft ? 'Draft withdrawn. It was never shown to students.' : 'Advisory resolved. Students no longer see it as current.',
  )
}
