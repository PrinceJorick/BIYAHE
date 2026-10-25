import { useState } from 'react'
import { Bell, House, Map as MapIcon, User } from 'lucide-react'
import type { Scenario } from './data'
import Welcome from './screens/Welcome'
import Home from './screens/Home'
import SafeSpots from './screens/SafeSpots'
import Alerts from './screens/Alerts'
import Profile from './screens/Profile'

type Tab = 'home' | 'map' | 'alerts' | 'profile'

const tabs: { id: Tab; label: string; Icon: typeof House }[] = [
  { id: 'home', label: 'Home', Icon: House },
  { id: 'map', label: 'Map', Icon: MapIcon },
  { id: 'alerts', label: 'Alerts', Icon: Bell },
  { id: 'profile', label: 'Profile', Icon: User },
]

export default function App() {
  const [signedIn, setSignedIn] = useState(false)
  const [tab, setTab] = useState<Tab>('home')
  const [scenario, setScenario] = useState<Scenario>('disrupted')

  if (!signedIn) {
    return (
      <div className="device">
        <Welcome onContinue={() => setSignedIn(true)} />
      </div>
    )
  }

  return (
    <div className="device">
      <main className="screen fade-in" key={tab + scenario} style={tab === 'map' ? { padding: 0 } : undefined}>
        {tab === 'home' && <Home scenario={scenario} onShowWay={() => setTab('map')} />}
        {tab === 'map' && <SafeSpots scenario={scenario} />}
        {tab === 'alerts' && <Alerts />}
        {tab === 'profile' && <Profile scenario={scenario} onScenario={setScenario} />}
      </main>
      <nav className="tabbar" aria-label="Primary">
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} className="tab" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
            <Icon size={22} strokeWidth={tab === id ? 2 : 1.6} />
            {label}
            {id === 'alerts' && scenario !== 'clear' && <span className="tab-badge" aria-label="New alerts" />}
          </button>
        ))}
      </nav>
    </div>
  )
}
