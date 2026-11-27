// Staff navigation (rail on wide screens, top bar on phones), shared by Coordinator Command and staff Settings.
import { LayoutDashboard, LogOut, Settings as SettingsIcon, Smartphone } from 'lucide-react'
import { useMedia } from '../lib/router'
import { chooseRole } from '../lib/store'
import Logo, { LogoMark } from './Logo'

export default function StaffNav({ current }: { current: 'coordinator' | 'settings' }) {
  const wide = useMedia('(min-width: 900px)')
  const here = (id: typeof current) => (current === id ? 'page' as const : undefined)
  return (
    <nav className="coord-nav" aria-label="Staff">
      {wide ? <Logo size={30} onDark /> : <LogoMark size={30} onDark label="BIYAHE" />}
      <ul>
        <li><a className="tab" href="#/coordinator" aria-current={here('coordinator')}><LayoutDashboard size={20} aria-hidden="true" /><span>Command</span></a></li>
        <li><a className="tab" href="#/settings" aria-current={here('settings')}><SettingsIcon size={20} aria-hidden="true" /><span>Settings</span></a></li>
        <li><a className="tab" href="#/home" onClick={() => chooseRole('student')}><Smartphone size={20} aria-hidden="true" /><span>Student view</span></a></li>
        <li><a className="tab" href="#/welcome" onClick={() => chooseRole(null)}><LogOut size={20} aria-hidden="true" /><span>Switch role</span></a></li>
      </ul>
    </nav>
  )
}
