import { useState } from 'react'
import { corridors } from '../data'
import { go } from '../lib/router'
import { setCorridor, useApp } from '../lib/store'

export default function Setup() {
  const s = useApp()
  const [picked, setPicked] = useState(s.corridorId ?? corridors[0].id)
  return (
    <main id="main" tabIndex={-1} className="solo">
      <form className="stack" style={{ gap: 28, flex: 1 }} onSubmit={(e) => { e.preventDefault(); setCorridor(picked); go('home') }}>
        <div className="stack">
          <h1 className="h1">Which way is home?</h1>
          <p className="body">This is the only thing we ask. It stays on this phone and you can change it any time.</p>
        </div>
        <fieldset className="choices">
          <legend className="sr-only">Your usual corridor home</legend>
          {corridors.map((c) => (
            <label key={c.id} className="choice">
              <input type="radio" name="corridor" value={c.id} checked={picked === c.id} onChange={() => setPicked(c.id)} />
              <span className="row-body">
                <span className="row-title">{c.name}</span>
                <span className="meta">via {c.via} · usually {c.usualMin} min</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="solo-actions">
          <button type="submit" className="btn btn-primary btn-block">Use this corridor</button>
        </div>
      </form>
    </main>
  )
}
