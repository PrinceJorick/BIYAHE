import { Bell, House, Map as MapIcon, Settings } from 'lucide-react'
import type { Route } from '../lib/router'

// The student navigation: four tabs (bottom bar on phones, side rail on wide screens, top bar on the map).
export const tabs = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'map', label: 'Map', Icon: MapIcon },
  { id: 'alerts', label: 'Alerts', Icon: Bell },
  { id: 'settings', label: 'Settings', Icon: Settings },
] as const

// The tab a screen belongs to (details and share belong to Home).
export const tabOf = (r: Route) => (r === 'go' || r === 'share' ? 'home' : r)
