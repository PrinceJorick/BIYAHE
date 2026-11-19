// Alerts (wireframe 5): one card per advisory, with its source and severity as labels, then forecast and traffic
// notices the app derives, then local news. Students see only published advisories that are current; ended ones
// are listed separately for a few hours, clearly marked, never as current warnings.
import { Building2, CircleCheck, Clock, CloudRain, ExternalLink, Gauge, Megaphone, Newspaper } from 'lucide-react'
import { useState } from 'react'
import Badge from '../components/Badge'
import Lvl from '../components/Lvl'
import { corridors, type Advisory, type AdvisorySource, type Severity } from '../data'
import { endedAt, otherCorridorAdvisories, phaseOf, recentlyEnded, scopeLabel, studentAdvisories } from '../lib/advisories'
import { ago, clock } from '../lib/derive'
import { rainNotice, trafficNotices } from '../lib/notices'
import type { Level } from '../lib/traffic'
import { newsNote, useTrip } from './useTrip'

const filters = ['All', 'PAGASA', 'LGU', 'Campus', 'Forecast', 'News'] as const
type Filter = (typeof filters)[number]
const sourceIcon = { PAGASA: CloudRain, LGU: Building2, Campus: Megaphone }
const severity: Record<Severity, { label: string; level: Level }> = {
  info: { label: 'Info', level: 'none' },
  warning: { label: 'Warning', level: 'mid' },
  critical: { label: 'Critical', level: 'high' },
}

export default function Alerts() {
  const { s, now, view, routes } = useTrip()
  const [filter, setFilter] = useState<Filter>('All')
  const show = (f: Filter) => filter === 'All' || filter === f
  const bySource = (list: Advisory[]) => list.filter((a) => show(a.source as AdvisorySource))
  const mine = bySource(studentAdvisories(s.snapshot.advisories, s.corridorId, now))
  const others = bySource(otherCorridorAdvisories(s.snapshot.advisories, s.corridorId, now))
  const ended = bySource(recentlyEnded(s.snapshot.advisories, s.corridorId, now))
  const rain = rainNotice(s.weather.hourly, s.weather.fetchedAt, now)
  const notices = show('Forecast') ? [...(rain ? [rain] : []), ...trafficNotices(routes)] : []
  const news = show('News') ? s.news?.items ?? [] : []
  const note = newsNote(s)

  const card = (a: Advisory, current: boolean) => {
    const Src = sourceIcon[a.source]
    const sev = severity[a.severity]
    const end = endedAt(a, now)
    const updated = a.updatedAt != null && a.updatedAt > a.issuedAt
    return (
      <li key={a.id}>
        <article className={`card alert${current ? '' : ' alert-ended'}`} aria-labelledby={`a-${a.id}`}>
          <div className="alert-head">
            <span className="chip-label"><Src size={14} aria-hidden="true" />{a.source}</span>
            {current
              ? <span className="chip-label"><Lvl level={sev.level}>{sev.label}</Lvl></span>
              : <span className="chip-label"><CircleCheck size={14} aria-hidden="true" />{phaseOf(a, now) === 'resolved' ? 'Resolved' : 'Expired'}{end != null ? ` ${clock(end)}` : ''}</span>}
            {a.scope === s.corridorId && <span className="chip-label">Your route</span>}
            <span className="caption alert-time">{ago(a.issuedAt, now)}</span>
          </div>
          <h2 className="h3" id={`a-${a.id}`}>{a.title}</h2>
          {a.body && <p className="body">{a.body}</p>}
          <p className="caption">
            {a.issuer} · issued {clock(a.issuedAt)}{current && updated ? ` · updated ${clock(a.updatedAt!)}` : ''} · Affects: {scopeLabel(a.scope, corridors)}
            {current && a.expiresAt != null && <> · <Clock size={12} aria-hidden="true" /> until {clock(a.expiresAt)}</>}
          </p>
          {!current && <p className="caption">No longer current.</p>}
        </article>
      </li>
    )
  }

  const nothing = mine.length + others.length + notices.length + news.length === 0

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Alerts</h1>
        <p className="meta">Advisories from PAGASA, the LGU and the campus DRRMO, forecast and traffic notices, and local news.</p>
      </div>
      {!view.offline && view.stale && (
        <p className="banner"><Clock size={20} aria-hidden="true" /><span>Last update {ago(s.snapshot.updatedAt, now)}. Advisories may have changed since.</span></p>
      )}
      <div className="chips chips-scroll" role="group" aria-label="Filter alerts">
        {filters.map((f) => <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</button>)}
      </div>

      {nothing && (
        <section className="card empty">
          <CircleCheck size={24} aria-hidden="true" />
          <h2 className="h2">{filter === 'All' ? 'No active alerts' : `Nothing from ${filter} right now`}</h2>
          <p className="body">New advisories appear here the moment they are issued, and are kept for offline reading.</p>
        </section>
      )}

      {mine.length > 0 && (
        <section className="stack" aria-labelledby="for-you">
          <h2 className="eyebrow" id="for-you">For you and your route <Badge kind={view.offline ? 'saved' : 'official'} /></h2>
          <ul className="stack">{mine.map((a) => card(a, true))}</ul>
        </section>
      )}

      {notices.length > 0 && (
        <section className="stack" aria-labelledby="notices">
          <h2 className="eyebrow" id="notices">Forecast and traffic</h2>
          <ul className="stack">
            {notices.map((n) => (
              <li key={n.id}>
                <article className="card alert" aria-labelledby={`n-${n.id}`}>
                  <div className="alert-head">
                    <span className="chip-label">{n.kind === 'rain' ? <CloudRain size={14} aria-hidden="true" /> : <Gauge size={14} aria-hidden="true" />}{n.source}</span>
                    <span className="chip-label"><Lvl level={n.level}>{n.word}</Lvl></span>
                  </div>
                  <h3 className="h3" id={`n-${n.id}`}>{n.title}</h3>
                  <p className="body">{n.detail}</p>
                  <p className="caption">Worked out by BIYAHE from {n.source}. Not an official advisory.</p>
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section className="stack" aria-labelledby="others">
          <h2 className="eyebrow" id="others">Other routes</h2>
          <ul className="stack">{others.map((a) => card(a, true))}</ul>
        </section>
      )}

      {(news.length > 0 || (show('News') && note)) && (
        <section className="stack" aria-labelledby="news">
          <h2 className="eyebrow" id="news">Local news</h2>
          {news.length > 0 && (
            <section className="card">
              <ul className="list">
                {news.map((n) => (
                  <li key={n.id}>
                    <a className="item item-top" href={n.url} target="_blank" rel="noreferrer">
                      <span className="item-icon"><Newspaper size={20} aria-hidden="true" /></span>
                      <span className="item-body">
                        <span className="caption">{n.source} · {ago(n.publishedAt, now)}</span>
                        <span className="item-title">{n.title}</span>
                      </span>
                      <ExternalLink className="item-chev" size={16} aria-hidden="true" /><span className="sr-only"> (opens the article)</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="caption">News reports, not official advisories.</p>
            </section>
          )}
          {note && <p className="caption">{note}</p>}
        </section>
      )}

      {ended.length > 0 && (
        <section className="stack" aria-labelledby="ended">
          <h2 className="eyebrow" id="ended">Recently ended</h2>
          <ul className="stack">{ended.map((a) => card(a, false))}</ul>
        </section>
      )}
    </div>
  )
}
