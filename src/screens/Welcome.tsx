import { Check, ShieldCheck, WifiOff } from 'lucide-react'

const points = [
  { Icon: Check, text: 'No reports or check-ins needed' },
  { Icon: WifiOff, text: 'Keeps working when the signal drops' },
  { Icon: ShieldCheck, text: 'Only counts, never your location history' },
]

export default function Welcome({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="screen fade-in" style={{ display: 'flex', flexDirection: 'column', paddingTop: 56 }}>
      <div className="row" style={{ gap: 10 }}>
        <img src="/favicon.svg" width={28} height={28} alt="" />
        <span style={{ fontWeight: 600, letterSpacing: '0.08em' }}>BIYAHE</span>
      </div>

      <div style={{ marginTop: 'auto' }} className="stack">
        <h1 className="h1" style={{ fontSize: 32 }}>Safer trips home, without lifting a finger.</h1>
        <p className="body">
          BIYAHE watches the road between campus and home using your class schedule and official advisories.
        </p>
        <ul className="stack" style={{ listStyle: 'none', marginTop: 12, gap: 10 }}>
          {points.map(({ Icon, text }) => (
            <li key={text} className="row" style={{ gap: 10, fontSize: 14, color: 'var(--ink-2)' }}>
              <Icon size={16} strokeWidth={2} color="var(--ink)" />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="stack" style={{ marginTop: 40, alignItems: 'center' }}>
        <button className="btn btn-primary btn-block" onClick={onContinue}>Continue with BatStateU account</button>
        <button className="link">How BIYAHE uses your data</button>
      </div>
    </div>
  )
}
