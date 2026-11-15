import { Database, ShieldCheck, TrendingUp } from 'lucide-react'
import type { Provenance } from '../data'

const kinds = {
  official: { Icon: ShieldCheck, label: 'Official' },
  estimate: { Icon: TrendingUp, label: 'Estimate' },
  saved: { Icon: Database, label: 'Saved copy' },
}

// Where the data on screen came from. Colour, icon, label and outline pattern all differ.
export default function Badge({ kind }: { kind: Provenance }) {
  const { Icon, label } = kinds[kind]
  return (
    <span className={`badge badge-${kind}`}>
      <Icon size={15} aria-hidden="true" />
      <span className="sr-only">Data source: </span>
      {label}
    </span>
  )
}
