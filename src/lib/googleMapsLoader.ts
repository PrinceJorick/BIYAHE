// Loads the Google Maps JavaScript API once, on demand, and reports whether it works. A rejected key (Google calls
// window.gm_authFailure) or a failed script load switches every map to the app's own simple map.
import { useSyncExternalStore } from 'react'
import { GOOGLE_MAPS_KEY } from './googleRoutes'

export type GoogleMapsStatus = 'idle' | 'loading' | 'ready' | 'error'

let status: GoogleMapsStatus = 'idle'
let reason: string | null = null
let promise: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = (next: GoogleMapsStatus, why: string | null = reason) => {
  status = next
  reason = why
  for (const l of listeners) l()
}

const CALLBACK = '__biyaheGoogleMapsReady'

export function loadGoogleMaps(): Promise<void> {
  if (!GOOGLE_MAPS_KEY) return Promise.reject(new Error('no Google Maps key'))
  if (promise) return promise
  emit('loading')
  promise = new Promise<void>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>
    w.gm_authFailure = () => {
      emit('error', 'Google rejected the map key. Check that Maps JavaScript API is enabled and this site is allowed.')
      console.warn(`[biyahe] ${reason}`)
    }
    w[CALLBACK] = () => {
      if (status !== 'error') emit('ready')
      resolve()
    }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&v=weekly&loading=async&callback=${CALLBACK}&region=PH&language=en`
    s.async = true
    s.onerror = () => {
      promise = null
      emit('error', 'Google Maps could not be loaded.')
      reject(new Error(reason!))
    }
    document.head.append(s)
  })
  return promise
}

const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
export const useGoogleMapsStatus = () => useSyncExternalStore(subscribe, () => status)
export const googleMapsProblem = () => reason
