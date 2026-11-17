import { BatteryLow, Bell, House, Info, Map as MapIcon, TriangleAlert, User, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { DEFAULT_CAMPUS } from './campuses'
import CorridorMap from './components/CorridorMap'
import Logo from './components/Logo'
import Toggle from './components/Toggle'
import { clock, concernsStudent } from './lib/derive'
import { useMedia, useRoute, type Route } from './lib/router'
import { dismissBatteryHint, isLowBattery, isOffline, setLowBattery, useApp, type State } from './lib/store'
import Alerts from './screens/Alerts'
import Coordinator from './screens/Coordinator'
import Home from './screens/Home'
import Profile from './screens/Profile'
import SafeSpots from './screens/SafeSpots'
import Setup from './screens/Setup'
import Share from './screens/Share'
import StaffAccess from './screens/StaffAccess'
import Welcome from './screens/Welcome'

const tabs = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'map', label: 'Map', Icon: MapIcon },
  { id: 'alerts', label: 'Alerts', Icon: Bell },
  { id: 'profile', label: 'Profile', Icon: User },
] as const

const titles: Record<Route, string> = {
  welcome: 'Welcome', setup: 'Choose your route', home: 'Home', map: 'Where to wait', share: "Share I'm safe",
  alerts: 'Alerts', profile: 'Profile & Offline', staff: 'Staff quick access', coordinator: 'Coordinator Command',
}

const studentRoutes: Route[] = ['home', 'map', 'share', 'alerts', 'profile']

// Where the current role is allowed to be.
function resolve(route: Route | null, s: State): Route {
  if (!s.role || route === 'welcome') return 'welcome'
  if (s.role === 'staff') return route === 'staff' ? 'staff' : 'coordinator'
  if (route === 'setup' || !s.corridorId) return 'setup'
  return route && studentRoutes.includes(route) ? route : 'home'
}

const focusMain = () => document.getElementById('main')?.focus()

export default function App() {
  const s = useApp()
  const raw = useRoute()
  const route = resolve(raw, s)
  const wide = useMedia('(min-width: 900px)')
  const lowBatt = isLowBattery(s)
  const first = useRef(true)

  useEffect(() => {
    if (raw !== route) history.replaceState(null, '', `#/${route}`)
  }, [raw, route])

  useEffect(() => {
    document.title = `${titles[route]} · BIYAHE`
    if (first.current) {
      first.current = false
      return
    }
    scrollTo(0, 0)
    focusMain()
  }, [route])

  useEffect(() => {
    document.documentElement.toggleAttribute('data-lowbatt', lowBatt)
  }, [lowBatt])

  if (!s.ready) return null

  const shell = route === 'welcome' ? <Welcome /> : route === 'setup' ? <Setup /> : route === 'staff' ? <StaffAccess /> : route === 'coordinator' ? <Coordinator /> : null
  const count = s.snapshot.advisories.filter((a) => concernsStudent(a, s.corridorId)).length

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); focusMain() }}>Skip to main content</a>
      {shell ?? (
        <div className="app">
          <nav className="nav" aria-label="Primary">
            <a className="nav-logo" href="#/home" aria-label="BIYAHE home"><Logo size={32} onDark /></a>
            <ul className="nav-list">
              {tabs.map(({ id, label, Icon }) => (
                <li key={id}>
                  <a className="tab" href={`#/${id}`} aria-current={route === id || (id === 'home' && route === 'share') ? 'page' : undefined}>
                    <Icon size={22} aria-hidden="true" />
                    {label}
                    {id === 'alerts' && count > 0 && <span className="tab-count">{count}<span className="sr-only"> active</span></span>}
                  </a>
                </li>
              ))}
            </ul>
            <p className="nav-foot">{DEFAULT_CAMPUS.shortName}<br />No account. No tracking.</p>
          </nav>

          <main id="main" tabIndex={-1} className="main">
            <header className="topbar">
              <Logo size={30} />
              <Toggle label="Low-Battery Mode" checked={lowBatt} onChange={setLowBattery} hideLabel={!wide} icon={<BatteryLow size={22} />} />
            </header>
            <div className="stack" style={{ marginBottom: 16 }}>
              {isOffline(s) && (
                <p className="banner tone-saved">
                  <WifiOff size={20} aria-hidden="true" />
                  <span>You're offline. Showing what we saved at {clock(s.savedAt)}.</span>
                </p>
              )}
              {s.batteryHint && !lowBatt && (
                <div className="banner tone-warn">
                  <BatteryLow size={20} aria-hidden="true" />
                  <div className="banner-body">
                    <span>Battery is under 20%. Low-Battery Mode keeps the guidance and drops the heavy map.</span>
                    <div className="cluster">
                      <button className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => setLowBattery(true)}>Turn on</button>
                      <button className="btn btn-quiet" onClick={dismissBatteryHint}>Not now</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {route === 'home' && <Home />}
            {route === 'map' && <SafeSpots />}
            {route === 'share' && <Share />}
            {route === 'alerts' && <Alerts />}
            {route === 'profile' && <Profile />}
          </main>

          {wide && (
            <aside className="pane-map" aria-label="Map">
              <CorridorMap mode="student" />
            </aside>
          )}
        </div>
      )}

      <div className="toast-region">
        <div role="status" aria-live="polite">
          {s.toast && !s.toast.urgent && <p className="toast" key={s.toast.id}><Info size={20} aria-hidden="true" />{s.toast.text}</p>}
        </div>
        <div role="alert" aria-live="assertive">
          {s.toast?.urgent && <p className="toast" key={s.toast.id}><TriangleAlert size={20} aria-hidden="true" />{s.toast.text}</p>}
        </div>
      </div>
    </>
  )
}
