import { CloudRain, GraduationCap, Info, Navigation, Users } from 'lucide-react'
import { fmtMin, route, spots, student, type Scenario } from '../data'

export default function Home({ scenario, onShowWay }: { scenario: Scenario; onShowWay: () => void }) {
  const disrupted = scenario !== 'clear'
  const spot = spots[0]

  return (
    <div className="stack" style={{ gap: 20 }}>
      <header className="row between">
        <div>
          <p className="eyebrow">{student.campus} · Tue {disrupted ? '3:04' : '2:10'} PM</p>
          <h1 className="h2">{disrupted ? `Stay put for now, ${student.name}` : `Good afternoon, ${student.name}`}</h1>
        </div>
        <div className="avatar" aria-hidden>{student.initial}</div>
      </header>

      {scenario === 'offline' && (
        <div className="banner">
          <Info size={16} />
          <span>You're offline. Showing what BIYAHE knew at 3:04 PM.</span>
        </div>
      )}

      {disrupted ? (
        <section className="card stack" style={{ gap: 16 }}>
          <div className="status warn">
            <span className="status-dot" />
            <div>
              <h2 className="h2">Delay your departure</h2>
              <p className="body" style={{ marginTop: 4 }}>
                Flooding on your usual route near Batangas City proper. Classes are suspended from 3:30 PM.
              </p>
            </div>
          </div>
          <div className="compare">
            <div>
              <p className="meta">If you leave now</p>
              <p className="num tone-warn" style={{ fontSize: 28 }}>{fmtMin(route.disruptedMin)}</p>
            </div>
            <div>
              <p className="meta">Usual</p>
              <p className="num" style={{ fontSize: 28, color: 'var(--ink-2)' }}>{fmtMin(route.usualMin)}</p>
            </div>
          </div>
          <p className="meta">Updated 1 min ago · PAGASA and 3 LGU road reports</p>
        </section>
      ) : (
        <section className="card">
          <div className="status ok">
            <span className="status-dot" />
            <div>
              <h2 className="h2">You're clear to go</h2>
              <p className="body" style={{ marginTop: 4 }}>No disruptions on your usual route right now.</p>
              <p className="meta" style={{ marginTop: 8 }}>Updated 2 min ago · PAGASA and LGU advisories</p>
            </div>
          </div>
        </section>
      )}

      {disrupted ? (
        <section className="stack" style={{ gap: 12 }}>
          <p className="label">Wait safely here</p>
          <div className="card stack" style={{ gap: 16 }}>
            <div>
              <h3 className="h2" style={{ fontSize: 17 }}>{spot.name}</h3>
              <p className="meta">{spot.walkMin} min walk · {spot.left} of {spot.capacity} spaces left</p>
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {spot.amenities.map((a) => <span key={a} className="tag">{a}</span>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button className="btn btn-primary" onClick={onShowWay}><Navigation size={16} />Directions</button>
              <button className="btn btn-ghost"><Users size={16} />Tell family</button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="card stack" style={{ gap: 16 }}>
            <div className="row between">
              <p className="label">Your usual route</p>
              <span className="tag">{route.modes}</span>
            </div>
            <div className="route">
              <div><p className="meta">From</p><p className="h3">{route.from}</p></div>
              <div className="route-line" />
              <div style={{ textAlign: 'right' }}><p className="meta">To</p><p className="h3">{route.to}</p></div>
            </div>
            <div className="divider" style={{ margin: 0 }} />
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <span className="num" style={{ fontSize: 40, lineHeight: 1 }}>{route.usualMin}</span>
              <span className="body">min travel time now</span>
            </div>
            <p className="meta">Leave after your {route.lastClass} class and you'll be home by about {route.eta}.</p>
          </section>
          <section className="card list" style={{ padding: '0 20px' }}>
            <div className="item">
              <CloudRain size={18} color="var(--ink-3)" style={{ marginTop: 2 }} />
              <div><p className="h3">Light rain, 26°C</p><p className="meta">No rainfall warning in Batangas</p></div>
            </div>
            <div className="item">
              <GraduationCap size={18} color="var(--ink-3)" style={{ marginTop: 2 }} />
              <div><p className="h3">Classes on</p><p className="meta">As scheduled at Alangilan</p></div>
            </div>
          </section>
        </>
      )}

      <p className="meta row" style={{ alignItems: 'flex-start', gap: 8 }}>
        <Info size={14} style={{ flex: 'none', marginTop: 3 }} />
        You don't need to report anything. BIYAHE estimates this from your schedule and official advisories.
      </p>
    </div>
  )
}
