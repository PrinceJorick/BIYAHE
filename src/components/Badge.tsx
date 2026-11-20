import { Database, FlaskConical, Radio, ShieldCheck, TrendingUp } from 'lucide-react'

export type BadgeKind = 'official' | 'estimate' | 'saved' | 'live' | 'simulated'

const kinds: Record<BadgeKind, { Icon: typeof Radio; label: string }> = {
  official: { Icon: ShieldCheck, label: 'Official' },
  estimate: { Icon: TrendingUp, label: 'Estimate' },
  saved: { Icon: Database, label: 'Saved copy' },
  live: { Icon: Radio, label: 'Live' },
  simulated: { Icon: FlaskConical, label: 'Simulated' },
}

// Where the data on screen came from. Neutral colour; icon, label and outline pattern tell the kinds apart.
export default function Badge({ kind, label }: { kind: BadgeKind; label?: string }) {
  const { Icon, label: fallback } = kinds[kind]
  return (
    <span className={`badge badge-${kind}`}>
      <Icon size={14} aria-hidden="true" />
      <span className="sr-only">Data source: </span>
      {label ?? fallback}
    </span>
  )
}
