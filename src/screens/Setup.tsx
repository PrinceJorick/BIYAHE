// Campus and route: the one question BIYAHE asks, plus the few settings that used to live on the Profile screen
// (Low-Battery Mode, the demo scenario for presentations, and information about data and this build).
import { ArrowLeft, Info } from 'lucide-react'
import { useState } from 'react'
import { campuses, CAMPUS_IDS } from '../campuses'
import { ACTIVE_CAMPUS, switchCampus } from '../campuses/active'
import Logo from '../components/Logo'
import Toggle from '../components/Toggle'
import { corridors } from '../data'
import { buildInfo } from '../lib/buildInfo'
import { clock } from '../lib/derive'
import { go } from '../lib/router'
import { chooseRole, isLowBattery, setCorridor, setLowBattery, setScenario, useApp, type Scenario } from '../lib/store'
import type { CampusId } from '../types'

const scenarios: { id: Scenario; label: string; hint: string }[] = [
  { id: 'clear', label: 'Clear', hint: 'All routes open. Home suggests heading home.' },
  { id: 'disrupted', label: 'Disrupted', hint: `Flooding closes ${corridors[0].via}. ${corridors[0].name} commuters are told to wait.` },
  { id: 'stale', label: 'Stale >30m', hint: 'The last update is 38 minutes old, so everything is marked Saved copy.' },
  { id: 'offline', label: 'Offline', hint: 'Simulates no signal. The app runs from the copy saved on this phone.' },
  { id: 'lowbattery', label: 'Low battery', hint: 'Simulates a battery under 20%: simple map, less polling.' },
]

export default function Setup() {
  const s = useApp()
  const [campusId, setCampusId] = useState<CampusId>(ACTIVE_CAMPUS.id)
  const routes = campuses[campusId].corridors
  const [picked, setPicked] = useState(s.corridorId ?? routes[0].id)
  const route = routes.some((c) => c.id === picked) ? picked : routes[0].id
  const returning = Boolean(s.corridorId)
  const d = buildInfo()
  const active = scenarios.find((x) => x.id === s.scenario)!

  return (
    <main id="main" tabIndex={-1} className="solo">
      {returning ? <a className="back" href="#/home"><ArrowLeft size={18} aria-hidden="true" />Home</a> : <Logo size={36} />}
      <form
        className="stack-lg"
        onSubmit={(e) => {
          e.preventDefault()
          setCorridor(route)
          // A different campus reloads the app with that campus's data; otherwise go straight home.
          if (!switchCampus(campusId, '#/home')) go('home')
        }}
      >
        <div className="page-head">
          <h1 className="h1">{returning ? 'Campus and route' : 'Which way is home?'}</h1>
          <p className="body">The only thing BIYAHE asks. It stays on this phone and you can change it any time.</p>
        </div>
        <fieldset className="choices">
          <legend className="eyebrow">Your campus</legend>
          {CAMPUS_IDS.map((id) => (
            <label key={id} className="choice">
              <input type="radio" name="campus" value={id} checked={campusId === id} onChange={() => setCampusId(id)} />
              <span className="item-title">{campuses[id].shortName}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="choices">
          <legend className="eyebrow">Your usual route home</legend>
          {routes.map((c) => (
            <label key={c.id} className="choice">
              <input type="radio" name="corridor" value={c.id} checked={route === c.id} onChange={() => setPicked(c.id)} />
              <span className="item-body">
                <span className="item-title">{c.name}</span>
                <span className="meta">via {c.via} · usually {c.usualMin} min</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className="btn btn-primary btn-block">{returning ? 'Save' : 'Use this route'}</button>
      </form>

      {returning && (
        <section className="stack-lg" aria-labelledby="settings">
          <h2 className="h2" id="settings">Settings</h2>
          <div className="card">
            <div className="between">
              <span className="item-body">
                <span className="item-title">Low-Battery Mode</span>
                <span className="meta">Simple map, no animation, less network use. Suggested under 20%.</span>
              </span>
              <Toggle label="Low-Battery Mode" hideLabel checked={isLowBattery(s)} onChange={setLowBattery} />
            </div>
          </div>

          <div className="card">
            <h3 className="h3" id="demo">Demo scenario</h3>
            <div className="chips" role="group" aria-labelledby="demo">
              {scenarios.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={s.scenario === x.id} onClick={() => setScenario(x.id)}>{x.label}</button>)}
            </div>
            <p className="meta" role="status">{active.hint}</p>
          </div>

          <div className="card">
            <h3 className="h3">Your data</h3>
            <p className="meta">Saved for offline at {clock(s.savedAt)}: route status, safe spots and alerts.</p>
            <p className="meta">{s.backend === 'supabase' ? 'Live from Supabase Realtime, with a saved copy on this phone.' : 'Demo data on this device. Staff updates sync between open tabs.'}</p>
            <p className="meta">No account, no location tracking. Staff see only how many students use each route (RA 10173).</p>
            <details className="diag">
              <summary><Info size={16} aria-hidden="true" />About this build</summary>
              <dl className="diag-list">
                {Object.entries({ Build: d.build, 'Google Maps': d.googleMaps, 'Local news': d.news, 'Supabase configuration': d.supabase, 'Walking router': d.walkRouter, 'Data versions': d.dataVersions }).map(([k, x]) => (
                  <div key={k}><dt>{k}</dt><dd>{x}</dd></div>
                ))}
              </dl>
            </details>
          </div>

          <button type="button" className="btn btn-secondary btn-block" onClick={() => { chooseRole(null); go('welcome') }}>Switch role (student or staff)</button>
        </section>
      )}
    </main>
  )
}
