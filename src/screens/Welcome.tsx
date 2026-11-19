import { ArrowRight, Clock, MapPin, ShieldCheck, WifiOff } from 'lucide-react'
import Logo from '../components/Logo'
import { go } from '../lib/router'
import { chooseRole, getState } from '../lib/store'

const points = [
  { Icon: Clock, title: 'One clear answer', text: 'Head home now, or wait. In under ten seconds, with the travel time against your usual.' },
  { Icon: MapPin, title: 'Where to wait', text: 'If you should stay, the nearest safe spot with space, power and water.' },
  { Icon: WifiOff, title: 'Works offline', text: 'The last saved copy keeps working without signal. No account, no tracking.' },
]

export default function Welcome() {
  return (
    <main id="main" tabIndex={-1} className="solo welcome">
      <Logo size={44} tagline />
      <div className="welcome-hero">
        <p className="tagline" lang="fil">Mas ligtas na paglalakbay para sa mas maraming <span>bukas.</span></p>
        <svg className="journey-line" width="200" height="18" viewBox="0 0 200 18" aria-hidden="true"><path d="M4 14C60 4 140 2 196 6" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /></svg>
        <h1 className="display">Know when to head home, and where to wait if you shouldn't.</h1>
        <p className="body">For BatStateU Alangilan, Pablo Borbon and Malvar commuters, and the campus teams that look after them.</p>
      </div>
      <ul className="welcome-points">
        {points.map(({ Icon, title, text }) => (
          <li key={title}>
            <span className="item-icon"><Icon size={20} aria-hidden="true" /></span>
            <span className="item-body"><span className="item-title">{title}</span><span className="meta">{text}</span></span>
          </li>
        ))}
      </ul>
      <div className="solo-actions">
        <button className="btn btn-primary btn-block" onClick={() => { chooseRole('student'); go(getState().corridorId ? 'home' : 'setup') }}>
          Continue as student<ArrowRight size={20} aria-hidden="true" />
        </button>
        <button className="btn btn-secondary btn-block" onClick={() => { chooseRole('staff'); go('staff') }}>
          <ShieldCheck size={20} aria-hidden="true" />Staff / DRRMO demo
        </button>
      </div>
    </main>
  )
}
