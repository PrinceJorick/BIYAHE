import { Clock, MapPin, WifiOff } from 'lucide-react'
import Logo from '../components/Logo'
import { go } from '../lib/router'
import { chooseRole, getState } from '../lib/store'

const points = [
  { Icon: Clock, text: 'One clear answer in under ten seconds: head home now, or wait.' },
  { Icon: MapPin, text: 'If you should wait, see the nearest safe spot with space, power and water.' },
  { Icon: WifiOff, text: 'Keeps working offline with the last saved copy. No account, no tracking.' },
]

export default function Welcome() {
  return (
    <main id="main" tabIndex={-1} className="solo">
      <Logo size={44} />
      <div className="stack">
        <h1 className="hero-title">Know when to head home, and where to wait if you shouldn't.</h1>
        <p className="body">For BatStateU Alangilan commuters and the campus team that looks after them.</p>
      </div>
      <ul className="stack">
        {points.map(({ Icon, text }) => (
          <li key={text} className="row" style={{ minHeight: 0, padding: 0, alignItems: 'flex-start' }}>
            <Icon size={22} aria-hidden="true" style={{ marginTop: 2, color: 'var(--sky)' }} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <div className="solo-actions">
        <button className="btn btn-primary btn-block" onClick={() => { chooseRole('student'); go(getState().corridorId ? 'home' : 'setup') }}>
          Continue as Student
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => { chooseRole('staff'); go('staff') }}>
          Staff / DRRMO Demo
        </button>
      </div>
    </main>
  )
}
