// Demo only: switch the simulated conditions between Clear and Flooding from any map. Same action as Settings →
// Demo scenarios (store.setScenario): every route status, map line, advisory and suggestion follows, on this device,
// its open tabs and, with Supabase, every device. The state shown comes from the data, so it stays right when
// another device switches it.
import { FlaskConical } from 'lucide-react'
import { demoFlooded, isOffline, setScenario, useApp } from '../lib/store'

export default function DemoFloodToggle() {
  const s = useApp()
  const flooded = demoFlooded(s)
  const off = isOffline(s)
  return (
    <div className="demo-switch" role="group" aria-label="Demo simulation (not real conditions)">
      <span className="demo-switch-label"><FlaskConical size={14} aria-hidden="true" />Demo</span>
      <button type="button" aria-pressed={!flooded} disabled={off} onClick={() => setScenario('clear')}>Clear</button>
      <button type="button" aria-pressed={flooded} disabled={off} onClick={() => setScenario('disrupted')}>Flooding</button>
    </div>
  )
}
