// Campus and route: the one question BIYAHE asks. Everything else (alerts, offline data, demo scenarios, privacy,
// build information) is on the Settings tab.
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { campuses, CAMPUS_IDS } from '../campuses'
import { ACTIVE_CAMPUS, switchCampus } from '../campuses/active'
import Logo from '../components/Logo'
import { go } from '../lib/router'
import { setCorridor, useApp } from '../lib/store'
import type { CampusId } from '../types'

export default function Setup() {
  const s = useApp()
  const [campusId, setCampusId] = useState<CampusId>(ACTIVE_CAMPUS.id)
  const routes = campuses[campusId].corridors
  const [picked, setPicked] = useState(s.corridorId ?? routes[0].id)
  const route = routes.some((c) => c.id === picked) ? picked : routes[0].id
  const returning = Boolean(s.corridorId)

  return (
    <main id="main" tabIndex={-1} className="solo">
      {returning ? <a className="back" href="#/settings"><ArrowLeft size={18} aria-hidden="true" />Settings</a> : <Logo size={36} />}
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

    </main>
  )
}
