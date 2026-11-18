import { Building2, CircleCheck, Clock, CloudRain, Info, Megaphone, OctagonAlert, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import Badge from '../components/Badge'
import { corridors, type Advisory, type AdvisorySource, type Severity } from '../data'
import { endedAt, otherCorridorAdvisories, phaseOf, recentlyEnded, scopeLabel, studentAdvisories } from '../lib/advisories'
import { ago, clock, studentView } from '../lib/derive'
import { useApp, useNow } from '../lib/store'

const filters: ('All' | AdvisorySource)[] = ['All', 'PAGASA', 'LGU', 'Campus']
const sourceIcon = { PAGASA: CloudRain, LGU: Building2, Campus: Megaphone }
const severity: Record<Severity, { Icon: typeof Info; label: string; tone: string }> = {
  info: { Icon: Info, label: 'Info', tone: 'saved' },
  warning: { Icon: TriangleAlert, label: 'Warning', tone: 'warn' },
  critical: { Icon: OctagonAlert, label: 'Critical', tone: 'danger' },
}

// Students see only published advisories that are current (not drafts, not resolved, not past their end time).
// Ended ones are listed separately for a few hours, clearly marked, never as current warnings.
export default function Alerts() {
  const s = useApp()
  const now = useNow()
  const v = studentView(s, now)
  const [filter, setFilter] = useState<(typeof filters)[number]>('All')
  const bySource = (list: Advisory[]) => list.filter((a) => filter === 'All' || a.source === filter)
  const mine = bySource(studentAdvisories(s.snapshot.advisories, s.corridorId, now))
  const others = bySource(otherCorridorAdvisories(s.snapshot.advisories, s.corridorId, now))
  const ended = bySource(recentlyEnded(s.snapshot.advisories, s.corridorId, now))

  const item = (a: Advisory, current: boolean) => {
    const Src = sourceIcon[a.source]
    const sev = severity[a.severity]
    const end = endedAt(a, now)
    const updated = a.updatedAt != null && a.updatedAt > a.issuedAt
    return (
      <li key={a.id}>
        <article className={`row ${current ? '' : 'tone-saved'}`} style={{ alignItems: 'flex-start' }}>
          <Src size={22} aria-hidden="true" style={{ marginTop: 2 }} />
          <div className="row-body" style={{ gap: 6 }}>
            <p className="meta">
              {a.issuer} · issued {clock(a.issuedAt)} ({ago(a.issuedAt, now)})
              {current && updated ? ` · updated ${clock(a.updatedAt!)}` : ''}
            </p>
            <h2 className="row-title">{a.title}</h2>
            <p className="meta"><strong>Affects:</strong> {scopeLabel(a.scope, corridors)}</p>
            {a.body && <p className="body">{a.body}</p>}
            <div className="cluster" style={{ gap: 12 }}>
              {current
                ? <span className={`tag tone-${sev.tone}`}><sev.Icon size={16} aria-hidden="true" />{sev.label}</span>
                : <span className="tag tone-saved"><CircleCheck size={16} aria-hidden="true" />{phaseOf(a, now) === 'resolved' ? 'Resolved' : 'Expired'}{end != null ? ` ${clock(end)}` : ''} · no longer current</span>}
              {a.scope === s.corridorId && <span className="tag">Your route</span>}
              {current && a.expiresAt != null && <span className="tag"><Clock size={16} aria-hidden="true" />Until {clock(a.expiresAt)}</span>}
              {current && <Badge kind={v.offline ? 'saved' : 'official'} />}
            </div>
          </div>
        </article>
      </li>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Alerts</h1>
        <p className="body">Current advisories from PAGASA, Batangas City and the campus DRRMO for the campus and your route.</p>
      </div>
      {!v.offline && v.stale && (
        <p className="banner tone-saved">
          <Clock size={20} aria-hidden="true" />
          <span>Last update {ago(s.snapshot.updatedAt, now)}. Advisories may have changed since; reconnect or check for an update.</span>
        </p>
      )}
      <div className="chips" role="group" aria-label="Filter by source">
        {filters.map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>
        ))}
      </div>
      {mine.length === 0 ? (
        <div className="empty">
          <CircleCheck size={28} aria-hidden="true" />
          <p className="h2">{filter === 'All' ? 'No active alerts' : `No ${filter} alerts right now`}</p>
          <p className="body">New advisories appear here the moment they are issued, and are kept for offline reading.</p>
        </div>
      ) : (
        <ul className="rows" aria-label="Current advisories for you">{mine.map((a) => item(a, true))}</ul>
      )}

      {others.length > 0 && (
        <section className="section" aria-labelledby="alerts-others" style={{ marginTop: 24 }}>
          <h2 id="alerts-others" className="h2">Other routes</h2>
          <p className="meta">Current advisories for routes other than yours.</p>
          <ul className="rows">{others.map((a) => item(a, true))}</ul>
        </section>
      )}

      {ended.length > 0 && (
        <section className="section" aria-labelledby="alerts-ended" style={{ marginTop: 24 }}>
          <h2 id="alerts-ended" className="h2">Recently ended</h2>
          <p className="meta">Resolved or expired in the last few hours. These are no longer current.</p>
          <ul className="rows">{ended.map((a) => item(a, false))}</ul>
        </section>
      )}
    </div>
  )
}
