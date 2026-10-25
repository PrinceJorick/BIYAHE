import { CalendarDays, Check, Layers, MessageSquare, WifiOff } from 'lucide-react'
import { student, type Scenario } from '../data'

const cached = [
  { Icon: Layers, text: 'Campus map and safe spots' },
  { Icon: CalendarDays, text: 'Your class schedule' },
  { Icon: Check, text: 'Last 12 hours of alerts' },
]

export default function Profile({ scenario, onScenario }: { scenario: Scenario; onScenario: (s: Scenario) => void }) {
  return (
    <div className="stack" style={{ gap: 24 }}>
      <header className="row">
        <div className="avatar" style={{ width: 48, height: 48 }}>{student.initial}</div>
        <div>
          <h1 className="h2">{student.name}</h1>
          <p className="meta">BatStateU · {student.campus}</p>
        </div>
      </header>

      {scenario === 'offline' && (
        <section className="card stack">
          <div className="row"><WifiOff size={18} /><h2 className="h3">You're offline</h2></div>
          <p className="body" style={{ fontSize: 14 }}>
            Showing what BIYAHE knew at 3:04 PM. Your recommendation is saved on this phone: stay on campus at the CICS Building lobby.
          </p>
        </section>
      )}

      <section className="stack" style={{ gap: 8 }}>
        <p className="label">Available offline</p>
        <ul className="card list" style={{ listStyle: 'none', padding: '0 20px' }}>
          {cached.map(({ Icon, text }) => (
            <li key={text} className="item" style={{ alignItems: 'center' }}>
              <Icon size={18} color="var(--ink-3)" />
              <span style={{ flex: 1 }}>{text}</span>
              <span className="meta tone-ok">Saved</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card row" style={{ alignItems: 'flex-start' }}>
        <MessageSquare size={18} color="var(--ink-3)" style={{ marginTop: 2 }} />
        <div>
          <p className="h3">Critical alerts by SMS</p>
          <p className="meta">If the campus network goes down too, urgent updates can still reach you by text.</p>
        </div>
      </section>

      <section className="stack" style={{ gap: 8 }}>
        <p className="label">Demo scenario</p>
        <div className="segmented" role="group" aria-label="Demo scenario">
          {(['clear', 'disrupted', 'offline'] as const).map((s) => (
            <button key={s} aria-pressed={scenario === s} onClick={() => onScenario(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
          ))}
        </div>
        <p className="meta">Campus data is simulated for the MVP.</p>
      </section>
    </div>
  )
}
