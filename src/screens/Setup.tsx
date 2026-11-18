import { useState } from 'react'
import { campuses, CAMPUS_IDS } from '../campuses'
import { ACTIVE_CAMPUS, switchCampus } from '../campuses/active'
import { go } from '../lib/router'
import { setCorridor, useApp } from '../lib/store'
import type { CampusId } from '../types'

export default function Setup() {
  const s = useApp()
  const [campusId, setCampusId] = useState<CampusId>(ACTIVE_CAMPUS.id)
  const routes = campuses[campusId].corridors
  const [picked, setPicked] = useState(s.corridorId ?? routes[0].id)
  const route = routes.some((c) => c.id === picked) ? picked : routes[0].id

  return (
    <main id="main" tabIndex={-1} className="solo">
      <form
        className="stack"
        style={{ gap: 28, flex: 1 }}
        onSubmit={(e) => {
          e.preventDefault()
          setCorridor(route)
          // A different campus reloads the app with that campus's data; otherwise go straight home.
          if (!switchCampus(campusId, '#/home')) go('home')
        }}
      >
        <div className="stack">
          <h1 className="h1">Which way is home?</h1>
          <p className="body">This is the only thing we ask. It stays on this phone and you can change it any time.</p>
        </div>
        <fieldset className="choices">
          <legend className="h2">Your campus</legend>
          {CAMPUS_IDS.map((id) => (
            <label key={id} className="choice">
              <input type="radio" name="campus" value={id} checked={campusId === id} onChange={() => setCampusId(id)} />
              <span className="row-body">
                <span className="row-title">{campuses[id].shortName}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="choices">
          <legend className="h2">Your usual route home</legend>
          {routes.map((c) => (
            <label key={c.id} className="choice">
              <input type="radio" name="corridor" value={c.id} checked={route === c.id} onChange={() => setPicked(c.id)} />
              <span className="row-body">
                <span className="row-title">{c.name}</span>
                <span className="meta">via {c.via} · usually {c.usualMin} min</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="solo-actions">
          <button type="submit" className="btn btn-primary btn-block">Use this route</button>
        </div>
      </form>
    </main>
  )
}
