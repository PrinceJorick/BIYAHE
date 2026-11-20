import { BatteryLow, FlaskConical, Info, TriangleAlert, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { ACTIVE_CAMPUS } from './campuses/active'
import Logo from './components/Logo'
import { tabOf, tabs } from './components/navTabs'
import { studentAdvisories } from './lib/advisories'
import { clock } from './lib/derive'
import { currentAlerts } from './lib/weather'
import { hrefOf, param, useRoute, type Loc, type Route } from './lib/router'
import { dismissBatteryHint, isLowBattery, isOffline, setLowBattery, useApp, useNow, type State } from './lib/store'
import Alerts from './screens/Alerts'
import Coordinator from './screens/Coordinator'
import Destination from './screens/Destination'
import Home from './screens/Home'
import MapScreen from './screens/MapScreen'
import Settings from './screens/Settings'
import Setup from './screens/Setup'
import Share from './screens/Share'
import StaffAccess from './screens/StaffAccess'
import { unreadNews } from './screens/useTrip'
import Welcome from './screens/Welcome'

const titles: Record<Route, string> = {
  welcome: 'Welcome', setup: 'Campus and route', home: 'Home', go: 'Trip details', map: 'Map', share: "Tell family you're safe",
  alerts: 'Alerts', settings: 'Settings', staff: 'Staff quick access', coordinator: 'Coordinator Command',
}

const studentRoutes: Route[] = ['home', 'go', 'map', 'share', 'alerts', 'settings']

// Where the current role is allowed to be.
function resolve({ name, arg, query }: Loc, s: State): Loc {
  if (!s.role || name === 'welcome') return { name: 'welcome', arg: null }
  if (s.role === 'staff') return { name: name === 'staff' ? 'staff' : 'coordinator', arg: null }
  if (name === 'setup' || !s.corridorId) return { name: 'setup', arg: null }
  if (name === 'go' && !arg) return { name: 'home', arg: null }
  if (name && studentRoutes.includes(name)) return { name, arg: name === 'go' || name === 'map' ? arg : null, ...(name === 'alerts' && query ? { query } : {}) }
  return { name: 'home', arg: null }
}

const focusMain = () => document.getElementById('main')?.focus()

export default function App() {
  const s = useApp()
  const now = useNow()
  const raw = useRoute()
  const loc = resolve(raw, s)
  const route = loc.name!
  const href = hrefOf(route, loc.arg, loc.query)
  const lowBatt = isLowBattery(s)
  const first = useRef(true)

  useEffect(() => {
    if (location.hash !== href) history.replaceState(null, '', href)
  }, [href])

  useEffect(() => {
    document.title = `${titles[route]} · BIYAHE`
    if (first.current) {
      first.current = false
      return
    }
    scrollTo(0, 0)
    focusMain()
  }, [route, loc.arg])

  useEffect(() => {
    document.documentElement.toggleAttribute('data-lowbatt', lowBatt)
  }, [lowBatt])

  if (!s.ready) return null

  const solo = route === 'welcome' ? <Welcome /> : route === 'setup' ? <Setup /> : route === 'staff' ? <StaffAccess /> : route === 'coordinator' ? <Coordinator /> : null
  // Alerts badge: current advisories and PAGASA warnings, plus local news for this route not opened yet.
  const count = studentAdvisories(s.snapshot.advisories, s.corridorId, now).length + currentAlerts(s.weather?.alerts, now).length + unreadNews(s, now).length
  const isMap = route === 'map'

  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); focusMain() }}>Skip to main content</a>
      {solo ?? (
        <div className={`app${isMap ? ' app-map' : ''}`}>
          <nav className="nav" aria-label="Primary">
            <a className="nav-logo" href="#/home" aria-label="BIYAHE home"><Logo size={30} onDark label={null} /></a>
            <ul className="nav-list">
              {tabs.map(({ id, label, Icon }) => (
                <li key={id}>
                  <a className="tab" href={`#/${id}`} aria-current={tabOf(route) === id ? 'page' : undefined}>
                    <Icon size={22} aria-hidden="true" />
                    <span>{label}</span>
                    {id === 'alerts' && count > 0 && <span className="tab-count">{count}<span className="sr-only"> new or active</span></span>}
                  </a>
                </li>
              ))}
            </ul>
            <div className="nav-foot">
              <p>{ACTIVE_CAMPUS.shortName}</p>
              <a href="#/setup">Change campus or route</a>
            </div>
          </nav>

          <main id="main" tabIndex={-1} className="main">
            {!isMap && (
              <header className="topbar">
                <a className="topbar-logo" href="#/home" aria-label="BIYAHE home"><Logo size={28} label={null} /></a>
                <button type="button" className="icon-toggle" role="switch" aria-checked={lowBatt} aria-label="Low-Battery Mode" onClick={() => setLowBattery(!lowBatt)}>
                  <BatteryLow size={20} aria-hidden="true" />
                  <span className="icon-toggle-label">Low-Battery Mode</span>
                  <span className="icon-toggle-state" aria-hidden="true">{lowBatt ? 'On' : 'Off'}</span>
                </button>
              </header>
            )}
            {!isMap && (isOffline(s) || (s.batteryHint && !lowBatt) || s.backend === 'device') && (
              <div className="banners">
                {s.backend === 'device' && !isOffline(s) && (
                  <p className="banner">
                    <FlaskConical size={20} aria-hidden="true" />
                    <span><span className="strong">Simulated campus data.</span> Route status, safe spots and campus advisories are demo data until a campus database is connected. Weather, traffic and news are live.</span>
                  </p>
                )}
                {isOffline(s) && (
                  <p className="banner">
                    <WifiOff size={20} aria-hidden="true" />
                    <span>You're offline. Showing what was saved at {clock(s.savedAt)}.</span>
                  </p>
                )}
                {s.batteryHint && !lowBatt && (
                  <div className="banner">
                    <BatteryLow size={20} aria-hidden="true" />
                    <div className="banner-body">
                      <span>Battery is under 20%. Low-Battery Mode keeps the guidance and uses a simple map.</span>
                      <div className="cluster">
                        <button className="btn btn-primary btn-sm" onClick={() => setLowBattery(true)}>Turn on</button>
                        <button className="btn btn-quiet btn-sm" onClick={dismissBatteryHint}>Not now</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {route === 'home' && <Home />}
            {route === 'go' && <Destination arg={loc.arg} />}
            {route === 'map' && <MapScreen arg={loc.arg} alerts={count} />}
            {route === 'share' && <Share />}
            {route === 'alerts' && <Alerts filterParam={param(loc, 'filter')} />}
            {route === 'settings' && <Settings />}
          </main>
        </div>
      )}

      <div className={`toast-region${isMap ? ' toast-region-map' : ''}`}>
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
