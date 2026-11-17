import { Building2, CircleCheck, CloudRain, Info, Megaphone, OctagonAlert, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import Badge from '../components/Badge'
import type { AdvisorySource, Severity } from '../data'
import { ago, clock, studentView } from '../lib/derive'
import { useApp, useNow } from '../lib/store'

const filters: ('All' | AdvisorySource)[] = ['All', 'PAGASA', 'LGU', 'Campus']
const sourceIcon = { PAGASA: CloudRain, LGU: Building2, Campus: Megaphone }
const severity: Record<Severity, { Icon: typeof Info; label: string; tone: string }> = {
  info: { Icon: Info, label: 'Info', tone: 'saved' },
  warning: { Icon: TriangleAlert, label: 'Warning', tone: 'warn' },
  critical: { Icon: OctagonAlert, label: 'Critical', tone: 'danger' },
}

export default function Alerts() {
  const s = useApp()
  const now = useNow()
  const v = studentView(s, now)
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const list = s.snapshot.advisories.filter((a) => filter === 'All' || a.source === filter).sort((a, b) => b.issuedAt - a.issuedAt)

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Alerts</h1>
        <p className="body">Official advisories from PAGASA, Batangas City and the campus DRRMO.</p>
      </div>
      <div className="chips" role="group" aria-label="Filter by source">
        {filters.map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty">
          <CircleCheck size={28} aria-hidden="true" />
          <p className="h2">{filter === 'All' ? 'No active alerts' : `No ${filter} alerts right now`}</p>
          <p className="body">New advisories appear here the moment they are issued, and are kept for offline reading.</p>
        </div>
      ) : (
        <ul className="rows">
          {list.map((a) => {
            const Src = sourceIcon[a.source]
            const sev = severity[a.severity]
            return (
              <li key={a.id}>
                <article className="row" style={{ alignItems: 'flex-start' }}>
                  <Src size={22} aria-hidden="true" style={{ marginTop: 2 }} />
                  <div className="row-body" style={{ gap: 6 }}>
                    <p className="meta">{a.issuer} · {clock(a.issuedAt)} ({ago(a.issuedAt, now)})</p>
                    <h2 className="row-title">{a.title}</h2>
                    {a.body && <p className="body">{a.body}</p>}
                    <div className="cluster" style={{ gap: 12 }}>
                      <span className={`tag tone-${sev.tone}`}><sev.Icon size={16} aria-hidden="true" />{sev.label}</span>
                      {a.scope === s.corridorId && <span className="tag">Your route</span>}
                      <Badge kind={v.offline ? 'saved' : 'official'} />
                    </div>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
