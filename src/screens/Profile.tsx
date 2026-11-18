import { BatteryLow, Building2, Database, MapPin, Radio, ShieldCheck } from 'lucide-react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import { corridors } from '../data'
import Badge from '../components/Badge'
import Toggle from '../components/Toggle'
import { clock, studentView } from '../lib/derive'
import { go } from '../lib/router'
import { chooseRole, isLowBattery, setLowBattery, setScenario, useApp, useNow, type Scenario } from '../lib/store'

const scenarios: { id: Scenario; label: string; hint: string }[] = [
  { id: 'clear', label: 'Clear', hint: 'All routes open. Home says head home now.' },
  { id: 'disrupted', label: 'Disrupted', hint: `Flooding closes ${corridors[0].via}. ${corridors[0].name} commuters are told to wait.` },
  { id: 'stale', label: 'Stale >30m', hint: 'The last update is 38 minutes old, so everything is marked Saved copy.' },
  { id: 'offline', label: 'Offline Saved Copy', hint: 'Simulates no signal. The app runs from the copy saved on this phone.' },
  { id: 'lowbattery', label: 'Low Battery', hint: 'Simulates a battery under 20%: text-first screens and a simplified map.' },
]

export default function Profile() {
  const s = useApp()
  const v = studentView(s, useNow())
  const active = scenarios.find((x) => x.id === s.scenario)!

  return (
    <div className="page">
      <h1 className="h1">Profile &amp; Offline</h1>
      <ul className="rows">
        <li>
          <div className="row">
            <Database className="row-icon" size={22} aria-hidden="true" />
            <span className="row-body">
              <span className="row-title">Saved for offline</span>
              <span className="meta">Route status, safe spots and alerts, saved {clock(s.savedAt)}</span>
            </span>
            <Badge kind="saved" />
          </div>
        </li>
        <li>
          <div className="row">
            <BatteryLow className="row-icon" size={22} aria-hidden="true" />
            <span className="row-body">
              <span className="row-title">Low-Battery Mode</span>
              <span className="meta">Text-first guidance and a simpler map. Suggested under 20%.</span>
            </span>
            <Toggle label="Low-Battery Mode" hideLabel checked={isLowBattery(s)} onChange={setLowBattery} />
          </div>
        </li>
        <li>
          <div className="row">
            <Building2 className="row-icon" size={22} aria-hidden="true" />
            <span className="row-body">
              <span className="row-title">Campus</span>
              <span className="meta">{ACTIVE_CAMPUS.shortName}</span>
            </span>
            <a className="btn btn-quiet" href="#/setup">Change<span className="sr-only"> campus</span></a>
          </div>
        </li>
        <li>
          <div className="row">
            <MapPin className="row-icon" size={22} aria-hidden="true" />
            <span className="row-body">
              <span className="row-title">Your route home</span>
              <span className="meta">{v.corridor.name} via {v.corridor.via}</span>
            </span>
            <a className="btn btn-quiet" href="#/setup">Change<span className="sr-only"> your route home</span></a>
          </div>
        </li>
        <li>
          <div className="row">
            <Radio className="row-icon" size={22} aria-hidden="true" />
            <span className="row-body">
              <span className="row-title">Data connection</span>
              <span className="meta">{s.backend === 'supabase' ? 'Live from Supabase Realtime, with a saved copy on this phone.' : 'Demo data on this device. Staff updates sync between open tabs.'}</span>
            </span>
          </div>
        </li>
        <li>
          <div className="row">
            <ShieldCheck className="row-icon" size={22} aria-hidden="true" />
            <span className="row-body">
              <span className="row-title">Privacy</span>
              <span className="meta">No account, no location tracking. Staff see only how many students use each route (RA 10173).</span>
            </span>
          </div>
        </li>
      </ul>

      <section className="stack" aria-labelledby="demo">
        <h2 id="demo" className="h2">Demo scenario</h2>
        <div className="chips" role="group" aria-labelledby="demo">
          {scenarios.map((x) => (
            <button key={x.id} className="chip" aria-pressed={s.scenario === x.id} onClick={() => setScenario(x.id)}>{x.label}</button>
          ))}
        </div>
        <p className="meta" role="status">{active.hint}</p>
      </section>

      <button className="btn btn-secondary btn-block" onClick={() => { chooseRole(null); go('welcome') }}>Switch role</button>
    </div>
  )
}
