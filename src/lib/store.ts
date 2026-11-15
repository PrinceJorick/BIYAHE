import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  corridorById, corridorStateFor, fallbackWeather, fixture,
  type Advisory, type Amenity, type CorridorStatus, type Severity, type Snapshot, type Weather,
} from '../data'
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

// Each tab keeps its own copy first, so a staff tab and a student tab can sit side by side.
function readPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(sessionStorage.getItem(PREFS) ?? localStorage.getItem(PREFS) ?? '{}')
  } catch {
    return {}
  }
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

const bc = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('biyahe-sync')
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
  void idbSet('snapshot', { snapshot, savedAt })
}

function receive(next: Snapshot) {
  if (state.scenario === 'offline') {
    held = next
    return
  }
  const known = new Set(state.snapshot.advisories.map((a) => a.id))
  const fresh = next.advisories.filter((a) => !known.has(a.id))
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
    void idbSet('weather', weather)
  } catch {
    set({ weather: { ...state.weather, live: false } })
  }
}

let started = false

export async function init() {
  if (started) return
  started = true

  const saved = await idbGet<{ snapshot: Snapshot; savedAt: number }>('snapshot')
  const weather = await idbGet<Weather>('weather')
  if (saved) set({ snapshot: saved.snapshot, savedAt: saved.savedAt })
  else void idbSet('snapshot', { snapshot: state.snapshot, savedAt: state.savedAt })
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

export type AdvisoryDraft = {
  scope: string
  severity: Severity
  title: string
  body: string
  // only for corridor-scoped advisories
  status?: CorridorStatus
}

export function publishAdvisory(d: AdvisoryDraft) {
  const now = Date.now()
  const advisory: Advisory = {
    id: `campus-${now}`, source: 'Campus', issuer: `Campus DRRMO · ${state.staffRole}`,
    title: d.title, body: d.body, severity: d.severity, scope: d.scope, issuedAt: now,
  }
  const next: Snapshot = { ...state.snapshot, advisories: [advisory, ...state.snapshot.advisories], updatedAt: now }
  const corridorChanged = d.status && d.scope !== 'campus' && d.scope !== 'all'
  if (corridorChanged) {
    next.corridors = { ...next.corridors, [d.scope]: corridorStateFor(corridorById(d.scope), d.status!, d.title, 'Campus DRRMO advisory') }
  }
  commit(next, async () => {
    const a = await remote.pushAdvisory(advisory)
    const c = corridorChanged ? await remote.pushCorridor(d.scope, next.corridors[d.scope]) : true
    return a && c
  })
  toast('Advisory published. Student views are updated.')
}
