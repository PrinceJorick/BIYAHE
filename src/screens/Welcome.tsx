// Welcome (onboarding step 1 of 2): what BIYAHE does, four plain promises that match how the app actually works,
// and one action. Staff reach their own flow from a quiet link. The privacy summary opens in the shared Dialog.
import { Calendar, Check, ShieldCheck, WifiOff } from 'lucide-react'
import { useState } from 'react'
import Dialog from '../components/Dialog'
import { OnboardingHeader } from '../components/Onboarding'
import { go } from '../lib/router'
import { chooseRole, getState } from '../lib/store'

const points = [
  { Icon: Check, text: 'No reports or check-ins. BIYAHE reads official advisories for you.' },
  { Icon: Calendar, text: 'Times your trip home with live traffic and the next hours of rain.' },
  { Icon: WifiOff, text: 'Your latest guidance stays saved when the signal drops.' },
  { Icon: ShieldCheck, text: 'Campus counts are aggregate. No location history is kept.' },
]

export default function Welcome() {
  const [privacy, setPrivacy] = useState(false)
  return (
    <main id="main" tabIndex={-1} className="onboard">
      <div className="onboard-inner">
        <OnboardingHeader step={1} />
        <div className="onboard-body">
          <h1 className="onboard-title">Know when to head home, and where to wait if you shouldn't.</h1>
          <p className="onboard-lead">BIYAHE watches weather, LGU advisories and traffic along your usual route from BatStateU, so you don't have to keep checking.</p>
          <ul className="onboard-points">
            {points.map(({ Icon, text }) => (
              <li key={text}><Icon size={18} aria-hidden="true" /><span>{text}</span></li>
            ))}
          </ul>
        </div>
        <div className="onboard-actions">
          <button type="button" className="btn btn-sun btn-block" onClick={() => { chooseRole('student'); go(getState().corridorId ? 'home' : 'setup') }}>
            Get started
          </button>
          <div className="onboard-links">
            <button type="button" className="onboard-link" onClick={() => setPrivacy(true)}>How BIYAHE uses your data</button>
            <button type="button" className="onboard-link" onClick={() => { chooseRole('staff'); go('staff') }}>Campus staff</button>
          </div>
        </div>
      </div>

      <Dialog open={privacy} onClose={() => setPrivacy(false)} title="How BIYAHE uses your data">
        <ul className="body bullets">
          <li>BIYAHE asks for one thing: your campus and usual route home. It is saved on this device only.</li>
          <li>No account, no check-in and no location request. BIYAHE never sends where you are.</li>
          <li>Campus staff see only how many students use each route, never who. These counts are aggregate.</li>
          <li>Saved on this device: route status, safe spots and advisories; local news, the last weather reading and route times for up to 24 hours.</li>
          <li>Asked over the internet: Google Weather and Google Routes (campus and town points only), Currents for news, Google Maps and OpenStreetMap for the map, and the OpenStreetMap walking router (campus and safe-spot points only).</li>
        </ul>
        <p className="meta">Personal data is handled under the Data Privacy Act of 2012 (RA 10173). You can clear everything BIYAHE saved from Settings.</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={() => setPrivacy(false)}>Close</button>
        </div>
      </Dialog>
    </main>
  )
}
