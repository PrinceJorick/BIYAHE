// Staff navigation (rail on wide screens, top bar on phones), shared by Coordinator Command and staff Settings.
// Icons are full-width glyphs so their left edges line up in the rail (a narrow phone or door glyph looked offset).
import { ArrowLeftRight, GraduationCap, LayoutDashboard, Settings as SettingsIcon } from 'lucide-react'
import { useMedia } from '../lib/router'
import { chooseRole } from '../lib/store'
import Logo, { LogoMark } from './Logo'

export default function StaffNav({ current }: { current: 'coordinator' | 'settings' }) {
  const wide = useMedia('(min-width: 900px)')
  const here = (id: typeof current) => (current === id ? 'page' as const : undefined)
  return (
    <>
    {/* Phones: the logo sits in a slim top bar and the tabs move to a bottom bar, as in the student app. */}
    {!wide && <div className="coord-topbar"><LogoMark size={28} label="BIYAHE" /></div>}
    <nav className="coord-nav" aria-label="Staff">
      {wide && <Logo size={30} onDark />}
      <ul>
        <li><a className="tab" href="#/coordinator" aria-current={here('coordinator')}><LayoutDashboard size={20} aria-hidden="true" /><span>Command</span></a></li>
        <li><a className="tab" href="#/settings" aria-current={here('settings')}><SettingsIcon size={20} aria-hidden="true" /><span>Settings</span></a></li>
        <li><a className="tab" href="#/home" onClick={() => chooseRole('student')}><GraduationCap size={20} aria-hidden="true" /><span>Student view</span></a></li>
        <li><a className="tab" href="#/welcome" onClick={() => chooseRole(null)}><ArrowLeftRight size={20} aria-hidden="true" /><span>Switch role</span></a></li>
      </ul>
    </nav>
    </>
  )
}
