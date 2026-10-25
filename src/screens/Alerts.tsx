import { useState } from 'react'
import { AlertTriangle, CloudRain, GraduationCap, House } from 'lucide-react'
import { alerts, type Alert } from '../data'

const icons: Record<Alert['kind'], typeof House> = {
  route: AlertTriangle,
  weather: CloudRain,
  campus: GraduationCap,
  shelter: House,
}

const filters = ['All', 'My route', 'Campus'] as const

export default function Alerts() {
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const shown = alerts.filter((a) =>
    filter === 'All' ? true : filter === 'My route' ? a.mine : a.kind === 'campus' || a.kind === 'shelter',
  )

  return (
    <div className="stack" style={{ gap: 20 }}>
      <h1 className="h1">Alerts</h1>
      <div className="segmented" role="group" aria-label="Filter alerts">
        {filters.map((f) => (
          <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>

      <section>
        <p className="label">Today</p>
        <ul className="list" style={{ listStyle: 'none', marginTop: 4 }}>
          {shown.map((a) => {
            const Icon = icons[a.kind]
            return (
              <li key={a.id} className="item">
                <span className={`item-icon${a.mine ? ' warn' : ''}`}><Icon size={18} /></span>
                <div style={{ flex: 1 }}>
                  <div className="row between" style={{ alignItems: 'baseline' }}>
                    <p className="h3">{a.title}</p>
                    <span className="meta num">{a.time}</span>
                  </div>
                  <p className="body" style={{ fontSize: 14 }}>{a.body}</p>
                  <p className="meta" style={{ marginTop: 4 }}>
                    {a.source}{a.mine && <span className="tone-warn"> · Your route</span>}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
