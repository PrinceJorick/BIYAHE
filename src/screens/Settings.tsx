// Settings for both roles, built from the same sections. Student: usual route, alerts, offline and sync,
// Low-Battery Mode, demo scenarios, privacy, build. Staff: role and campus in place of route and alerts, the rest
// shared, with staff privacy notes.
import { BatteryLow, Bell, Building2, Database, Flag, Info, RefreshCw, ShieldCheck, Trash2, UserCog, Wifi, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import Badge from '../components/Badge'
import Dialog from '../components/Dialog'
import MarshalSpotPicker from '../components/MarshalSpotPicker'
import Toggle from '../components/Toggle'
import { buildInfo } from '../lib/buildInfo'
import { ago, clock, fmtMin, studentView } from '../lib/derive'
import { NEWS_CACHE_TTL_MS } from '../lib/news'
import { go, hrefOf } from '../lib/router'
import {
  chooseRole, clearOfflineData, isLowBattery, isOffline, setAlertPrefs, setLowBattery, setScenario, setStaffRole,
  ROLE_TASKS, STAFF_ROLES, syncNow, toast, useApp, useNow, type AlertPrefs, type Scenario, type State,
} from '../lib/store'

const scenarios: { id: Scenario; label: string; hint: string }[] = [
  { id: 'clear', label: 'Clear', hint: 'No hazards. Every route is clear.' },
  { id: 'disrupted', label: 'Flooding', hint: 'A simulated flood closes every route that passes it. Ponding slows another.' },
  { id: 'stale', label: 'Stale data', hint: 'Last update 38 min ago. Routes show Unknown until new data arrives.' },
  { id: 'offline', label: 'Offline', hint: 'No signal. The app runs from what this device saved.' },
  { id: 'lowbattery', label: 'Low battery', hint: 'Battery under 20%: no live traffic, less polling.' },
]

const alertRows: { key: Exclude<keyof AlertPrefs, 'notify'>; label: string; hint: string }[] = [
  { key: 'routes', label: 'Route closures', hint: 'From the LGU and campus DRRMO.' },
  { key: 'pagasa', label: 'PAGASA warnings', hint: 'Rainfall and storm warnings.' },
  { key: 'classes', label: 'Class suspensions', hint: 'From the campus or LGU.' },
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

function UsualRoute({ s, now }: { s: State; now: number }) {
  const v = studentView(s, now)
  return (
    <section className="card" aria-labelledby="usual">
      <h2 className="h2" id="usual">Your route</h2>
      <div className="item">
        <span className="item-icon dest-flag"><Flag size={20} aria-hidden="true" /></span>
        <span className="item-body">
          <span className="item-title">{ACTIVE_CAMPUS.shortName} to {v.corridor.name}</span>
          <span className="meta">via {v.corridor.via} · usually {fmtMin(v.corridor.usualMin)}</span>
        </span>
      </div>
      <div className="cluster">
        <a className="btn btn-secondary btn-sm" href="#/setup">Change campus or route</a>
        <a className="btn btn-quiet btn-sm" href={hrefOf('go', `route/${v.corridor.id}`)}>Trip details</a>
      </div>
    </section>
  )
}

function StaffRoleCard({ s }: { s: State }) {
  return (
    <section className="card" aria-labelledby="staff-role">
      <h2 className="h2" id="staff-role"><UserCog size={18} aria-hidden="true" /> Your role</h2>
      <fieldset className="choices">
        <legend className="sr-only">Role you are covering</legend>
        {STAFF_ROLES.map((r) => (
          <label key={r.id} className="choice">
            <input type="radio" name="staff-role" checked={s.staffRole === r.id} onChange={() => { setStaffRole(r.id); toast(`Role: ${r.id}.`) }} />
            <span className="item-body">
              <span className="item-title">{r.id}</span>
              <span className="meta">{r.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {s.staffRole === 'Building Marshal' && <MarshalSpotPicker spots={ACTIVE_CAMPUS.spots} />}
      <ul className="meta bullets">{ROLE_TASKS[s.staffRole].map((t) => <li key={t}>{t}</li>)}</ul>
      <div className="item">
        <span className="item-icon"><Building2 size={20} aria-hidden="true" /></span>
        <span className="item-body">
          <span className="item-title">{ACTIVE_CAMPUS.shortName}</span>
          <span className="meta">Campus you manage</span>
        </span>
        <a className="btn btn-secondary btn-sm" href="#/staff">Change</a>
      </div>
    </section>
  )
}

function AlertPrefsCard({ s }: { s: State }) {
  const canNotify = typeof Notification !== 'undefined'
  const notify = async (on: boolean) => {
    if (!on) return setAlertPrefs({ notify: false })
    if (!canNotify) return toast('This browser cannot show notifications.')
    const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    if (p === 'granted') {
      setAlertPrefs({ notify: true })
      toast('Notifications on while BIYAHE is open.')
    } else toast('Notifications are blocked in your browser settings.')
  }
  return (
    <section className="card" aria-labelledby="alert-prefs">
      <h2 className="h2" id="alert-prefs"><Bell size={18} aria-hidden="true" /> Alerts</h2>
      <p className="meta">What BIYAHE announces. Everything stays listed under Alerts.</p>
      <ul className="list">
        {alertRows.map((r) => (
          <li key={r.key}><Switch id={`pref-${r.key}`} label={r.label} hint={r.hint} checked={s.alertPrefs[r.key]} onChange={(on) => setAlertPrefs({ [r.key]: on })} /></li>
        ))}
        <li>
          <Switch id="pref-notify" label="Browser notifications" checked={s.alertPrefs.notify} disabled={!canNotify} onChange={(on) => void notify(on)}
            hint={canNotify ? 'Only while BIYAHE is open in a tab. No push service.' : 'Not supported in this browser.'} />
        </li>
      </ul>
    </section>
  )
}

function OfflineSync({ s, now }: { s: State; now: number }) {
  const offline = isOffline(s)
  const [confirm, setConfirm] = useState(false)
  const sync = async () => {
    const r = await syncNow()
    toast(r === 'ok' ? 'Up to date.' : r === 'offline' ? 'Offline. Showing saved data.' : r === 'busy' ? 'Already syncing.' : 'Some sources unreachable. Showing saved data.')
  }
  const sources = [
    { name: 'Routes, safe spots, advisories', at: s.savedAt, note: s.backend === 'supabase' ? 'Supabase' : 'Simulated demo data' },
    { name: 'Local news', at: s.news?.fetchedAt || null, note: s.news?.fetchedAt ? `Currents · kept ${NEWS_CACHE_TTL_MS / 3_600_000} h` : 'Not saved yet' },
    { name: 'Weather', at: s.weather?.source === 'google' ? s.weather.fetchedAt : null, note: 'Google Weather · kept 24 h' },
    { name: 'Live traffic', at: s.traffic?.fetchedAt ?? null, note: 'Google Routes · kept 24 h' },
    { name: 'Offline map', at: null, note: 'OpenStreetMap streets for every campus · kept 30 days' },
  ]
  return (
    <section className="card" aria-labelledby="offline-data">
      <div className="card-head">
        <h2 className="h2" id="offline-data"><Database size={18} aria-hidden="true" /> Offline and sync</h2>
        <p className="meta cluster">{offline ? <><WifiOff size={16} aria-hidden="true" />Offline</> : <><Wifi size={16} aria-hidden="true" />Online</>}</p>
      </div>
      <p className="meta">Last sync: {s.lastSync ? `${clock(s.lastSync)} (${ago(s.lastSync, now)})` : 'not yet this visit'}</p>
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
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Clear offline data?">
        <p className="body">Removes saved routes, safe spots, advisories, news and walking routes from this device. Your campus, route and settings stay.</p>
        <p className="meta">Demo data shows until the next sync.</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirm(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => {
            setConfirm(false)
            void clearOfflineData().then(() => toast('Offline data cleared.'))
          }}>Clear offline data</button>
        </div>
      </Dialog>
    </section>
  )
}

function Battery({ s }: { s: State }) {
  return (
    <section className="card" aria-labelledby="battery">
      <div className="between">
        <span className="item-body">
          <span className="item-title" id="battery"><BatteryLow size={18} aria-hidden="true" /> Low-Battery Mode</span>
          <span className="meta">No live traffic or animation, less data. Suggested under 20%.</span>
        </span>
        <Toggle label="Low-Battery Mode" hideLabel checked={isLowBattery(s)} onChange={setLowBattery} />
      </div>
    </section>
  )
}

function Demo({ s }: { s: State }) {
  const active = scenarios.find((x) => x.id === s.scenario)
  return (
    <section className="card" aria-labelledby="demo">
      <div className="card-head">
        <h2 className="h2" id="demo">Demo scenarios</h2>
        <Badge kind="simulated" />
      </div>
      <div className="chips" role="group" aria-labelledby="demo">
        {scenarios.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={s.scenario === x.id} onClick={() => setScenario(x.id)}>{x.label}</button>)}
      </div>
      {active && <p className="meta" role="status">{active.hint}</p>}
      <p className="caption">Changes this device and its open tabs only, never shared records.</p>
    </section>
  )
}

function Privacy({ s, staff }: { s: State; staff: boolean }) {
  return (
    <section className="card" aria-labelledby="privacy">
      <h2 className="h2" id="privacy"><ShieldCheck size={18} aria-hidden="true" /> Privacy</h2>
      <ul className="meta bullets">
        {staff ? (
          <>
            <li>You see how many students use each route, never who (RA 10173).</li>
            <li>No staff sign-in yet: your role is a choice saved on this device.</li>
            <li>Headcounts and advisories you change are shared with open student views{s.backend === 'supabase' ? ' and Supabase' : ' on this device'}.</li>
          </>
        ) : (
          <>
            <li>BIYAHE asks only for your campus and usual route. Both stay on this device.</li>
            <li>No account, no check-in, no location tracking.</li>
            <li>Staff see route counts only, never who (RA 10173).</li>
          </>
        )}
        <li>Online requests: Google Weather and Routes (campus and town points only), Currents news, Google Maps and OpenStreetMap{s.backend === 'supabase' ? ', Supabase' : ''}.</li>
      </ul>
    </section>
  )
}

function About() {
  const d = buildInfo()
  return (
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
  )
}

export default function Settings() {
  const s = useApp()
  const now = useNow()
  const staff = s.role === 'staff'
  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Settings</h1>
        <p className="meta">{staff ? 'Your role, campus and this device.' : 'Your route, alerts and this device.'}</p>
      </div>
      {staff ? <StaffRoleCard s={s} /> : <><UsualRoute s={s} now={now} /><AlertPrefsCard s={s} /></>}
      <OfflineSync s={s} now={now} />
      <Battery s={s} />
      <Demo s={s} />
      <Privacy s={s} staff={staff} />
      <About />
      <button type="button" className="btn btn-secondary btn-block" onClick={() => { chooseRole(null); go('welcome') }}>Switch role (student or staff)</button>
    </div>
  )
}
