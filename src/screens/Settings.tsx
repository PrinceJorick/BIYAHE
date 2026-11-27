// Settings (the fourth tab; replaces the old Profile screen): your usual route, which alerts BIYAHE announces,
// offline storage and sync, Low-Battery Mode, demo scenarios for presentations, privacy and build information.
import { BatteryLow, Bell, Database, Flag, Info, RefreshCw, ShieldCheck, Trash2, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import Badge from '../components/Badge'
import Dialog from '../components/Dialog'
import Toggle from '../components/Toggle'
import { corridors } from '../data'
import { buildInfo } from '../lib/buildInfo'
import { ago, clock, fmtMin, studentView } from '../lib/derive'
import { NEWS_CACHE_TTL_MS } from '../lib/news'
import { go, hrefOf } from '../lib/router'
import {
  chooseRole, clearOfflineData, isLowBattery, isOffline, setAlertPrefs, setLowBattery, setScenario, syncNow, toast, useApp, useNow,
  type AlertPrefs, type Scenario,
} from '../lib/store'

const scenarios: { id: Scenario; label: string; hint: string }[] = [
  { id: 'clear', label: 'Clear route', hint: 'All routes open. Home suggests heading home.' },
  { id: 'disrupted', label: 'Route disruption (flooding)', hint: `Simulated flooding closes ${corridors[0].via}. ${corridors[0].name} commuters are told to wait.` },
  { id: 'stale', label: 'Stale data (>30 min)', hint: 'The last update is 38 minutes old, so everything is marked Saved copy.' },
  { id: 'offline', label: 'Offline mode', hint: 'Simulates no signal. The app runs from the copy saved on this device.' },
  { id: 'lowbattery', label: 'Low battery', hint: 'Simulates a battery under 20%: simple map, less polling.' },
]

const alertRows: { key: Exclude<keyof AlertPrefs, 'notify'>; label: string; hint: string }[] = [
  { key: 'routes', label: 'Route and LGU disruptions', hint: 'Closures and advisories from the LGU and the campus DRRMO.' },
  { key: 'pagasa', label: 'PAGASA weather warnings', hint: 'Rainfall and storm warnings for the campus area.' },
  { key: 'classes', label: 'Class suspension notices', hint: 'Suspensions announced by the campus or the LGU.' },
]

/** A native checkbox shown as a switch: keyboard and screen readers get a real checkbox. */
function Switch({ id, label, hint, checked, disabled, onChange }: {
  id: string; label: string; hint: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className={`switch${disabled ? ' is-disabled' : ''}`} htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(e.currentTarget.checked)} />
      <span className="switch-track" aria-hidden="true" />
      <span>
        <span className="item-title">{label}</span>
        <span className="meta" id={`${id}-hint`}>{hint}</span>
      </span>
    </label>
  )
}

export default function Settings() {
  const s = useApp()
  const now = useNow()
  const v = studentView(s, now)
  const offline = isOffline(s)
  const [confirm, setConfirm] = useState(false)
  const d = buildInfo()
  const active = scenarios.find((x) => x.id === s.scenario)
  const canNotify = typeof Notification !== 'undefined'

  const notify = async (on: boolean) => {
    if (!on) return setAlertPrefs({ notify: false })
    if (!canNotify) return toast('This browser cannot show notifications.')
    const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    if (p === 'granted') {
      setAlertPrefs({ notify: true })
      toast('Notifications on while BIYAHE is open.')
    } else toast('Notifications are blocked for this site in your browser settings.')
  }

  const sync = async () => {
    const r = await syncNow()
    toast(r === 'ok' ? 'Everything is up to date.' : r === 'offline' ? 'You are offline. Showing what is saved.' : r === 'busy' ? 'Already syncing.' : 'Some sources could not be reached. Showing what was saved.')
  }

  const sources = [
    { name: 'Route status, safe spots, advisories', at: s.savedAt, note: s.backend === 'supabase' ? 'Supabase, saved on this device' : 'Simulated demo data, saved on this device' },
    { name: 'Local news', at: s.news?.fetchedAt || null, note: s.news?.fetchedAt ? `Currents, saved copy kept for ${NEWS_CACHE_TTL_MS / 3_600_000} hours` : 'Not saved yet' },
    { name: 'Weather', at: s.weather?.source === 'google' ? s.weather.fetchedAt : null, note: 'Google Weather, reused for 20 minutes, saved copy up to 24 hours' },
    { name: 'Live traffic', at: s.traffic?.fetchedAt ?? null, note: 'Google Routes, reused for 10 minutes, saved copy up to 24 hours' },
  ]

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Settings</h1>
        <p className="meta">Your route, alerts and what BIYAHE keeps on this device.</p>
      </div>

      <section className="card" aria-labelledby="usual">
        <h2 className="h2" id="usual">Your usual route</h2>
        <div className="item">
          <span className="item-icon dest-flag"><Flag size={20} aria-hidden="true" /></span>
          <span className="item-body">
            <span className="item-title">{ACTIVE_CAMPUS.shortName} to {v.corridor.name}</span>
            <span className="meta">via {v.corridor.via} · road commute, usually {fmtMin(v.corridor.usualMin)}</span>
          </span>
        </div>
        <div className="cluster">
          <a className="btn btn-secondary btn-sm" href="#/setup">Change campus or route</a>
          <a className="btn btn-quiet btn-sm" href={hrefOf('go', `route/${v.corridor.id}`)}>Trip details</a>
        </div>
      </section>

      <section className="card" aria-labelledby="alert-prefs">
        <h2 className="h2" id="alert-prefs"><Bell size={18} aria-hidden="true" /> Alerts</h2>
        <p className="meta">Which new alerts BIYAHE announces on screen. Every alert is still listed under Alerts.</p>
        <ul className="list">
          {alertRows.map((r) => (
            <li key={r.key}><Switch id={`pref-${r.key}`} label={r.label} hint={r.hint} checked={s.alertPrefs[r.key]} onChange={(on) => setAlertPrefs({ [r.key]: on })} /></li>
          ))}
          <li>
            <Switch id="pref-notify" label="Browser notifications" checked={s.alertPrefs.notify} disabled={!canNotify} onChange={(on) => void notify(on)}
              hint={canNotify ? 'A system notification for new alerts while BIYAHE is open in a tab. BIYAHE has no push service, so nothing arrives when it is closed.' : 'Not supported in this browser.'} />
          </li>
        </ul>
      </section>

      <section className="card" aria-labelledby="offline-data">
        <div className="card-head">
          <h2 className="h2" id="offline-data"><Database size={18} aria-hidden="true" /> Offline and sync</h2>
          <p className="meta cluster">{offline ? <><WifiOff size={16} aria-hidden="true" />Offline</> : <><Wifi size={16} aria-hidden="true" />Online</>}</p>
        </div>
        <p className="meta">Last full sync: {s.lastSync ? `${clock(s.lastSync)} (${ago(s.lastSync, now)})` : 'not yet on this visit'}</p>
        <ul className="list">
          {sources.map((x) => (
            <li key={x.name}>
              <div className="item">
                <span className="item-body">
                  <span className="item-title">{x.name}</span>
                  <span className="meta">{x.at ? `${ago(x.at, now)} · ` : ''}{x.note}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="cluster">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void sync()} disabled={s.syncing || offline} aria-busy={s.syncing}>
            <RefreshCw size={16} aria-hidden="true" className={s.syncing ? 'spin' : undefined} />{s.syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirm(true)}><Trash2 size={16} aria-hidden="true" />Clear offline data</button>
        </div>
      </section>

      <section className="card" aria-labelledby="battery">
        <div className="between">
          <span className="item-body">
            <span className="item-title" id="battery"><BatteryLow size={18} aria-hidden="true" /> Low-Battery Mode</span>
            <span className="meta">Simple map, no animation, less network use. Suggested under 20%.</span>
          </span>
          <Toggle label="Low-Battery Mode" hideLabel checked={isLowBattery(s)} onChange={setLowBattery} />
        </div>
      </section>

      <section className="card" aria-labelledby="demo">
        <div className="card-head">
          <h2 className="h2" id="demo">Demo scenarios</h2>
          <Badge kind="simulated" />
        </div>
        <div className="chips" role="group" aria-labelledby="demo">
          {scenarios.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={s.scenario === x.id} onClick={() => setScenario(x.id)}>{x.label}</button>)}
        </div>
        {active && <p className="meta" role="status">{active.hint}</p>}
        <p className="caption">For presentations. Scenarios change only this device and its open tabs, never shared or official records.</p>
      </section>

      <section className="card" aria-labelledby="privacy">
        <h2 className="h2" id="privacy"><ShieldCheck size={18} aria-hidden="true" /> Privacy</h2>
        <ul className="meta bullets">
          <li>BIYAHE asks for one thing: your campus and usual route home. It stays on this device.</li>
          <li>No account, no check-in, no location request and no background GPS. BIYAHE never sends where you are.</li>
          <li>Staff see only how many students use each route, never who (aggregate counts, RA 10173).</li>
          <li>Saved on this device: route status, safe spots and advisories; local news, the last weather reading and route times for up to 24 hours; your settings and which articles you opened.</li>
          <li>Asked over the internet: Google Weather and Google Routes (campus and town points only), Currents for news, Google Maps and OpenStreetMap for the map{s.backend === 'supabase' ? ', Supabase for shared campus data' : ''}, and the OpenStreetMap walking router (campus and safe-spot points only).</li>
        </ul>
      </section>

      <section className="card">
        <details className="diag">
          <summary><Info size={16} aria-hidden="true" />About this build</summary>
          <dl className="diag-list">
            {Object.entries({ Build: d.build, 'Google Maps': d.googleMaps, Weather: d.weather, 'Local news': d.news, 'Supabase configuration': d.supabase, 'Walking router': d.walkRouter, 'Data versions': d.dataVersions }).map(([k, x]) => (
              <div key={k}><dt>{k}</dt><dd>{x}</dd></div>
            ))}
          </dl>
        </details>
      </section>

      <button type="button" className="btn btn-secondary btn-block" onClick={() => { chooseRole(null); go('welcome') }}>Switch role (student or staff)</button>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Clear offline data?">
        <p className="body">This removes BIYAHE's saved route status, safe spots, advisories, news and walking routes from this device. Your campus, route and settings stay. Nothing else on your device is touched.</p>
        <p className="meta">Until the next sync, BIYAHE shows its built-in demo data.</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => {
            setConfirm(false)
            void clearOfflineData().then(() => toast('Offline data cleared.'))
          }}>Clear offline data</button>
        </div>
      </Dialog>
    </div>
  )
}
