// Alerts (wireframe 5): one card per advisory, with its source and severity as labels, then PAGASA weather warnings
// (Google Weather public alerts), forecast and traffic notices the app derives, and local news. Students see only
// published advisories that are current; ended ones are listed separately for a few hours, never as current.
// Deep link: #/alerts?filter=news opens the Local news filter (Home → More local news).
import { Building2, CircleCheck, Clock, CloudRain, ExternalLink, Gauge, GraduationCap, Megaphone, ShieldAlert } from 'lucide-react'
import { useEffect } from 'react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import Badge from '../components/Badge'
import Lvl from '../components/Lvl'
import NewsArticleRow, { NewsCredit } from '../components/NewsArticleRow'
import { corridors, type Advisory, type Severity } from '../data'
import { endedAt, otherCorridorAdvisories, phaseOf, recentlyEnded, scopeLabel, studentAdvisories } from '../lib/advisories'
import { ago, clock } from '../lib/derive'
import { placesFor } from '../lib/news'
import { rainNotice, trafficNotices } from '../lib/notices'
import { hrefOf } from '../lib/router'
import type { Level } from '../lib/traffic'
import { currentAlerts } from '../lib/weather'
import type { WeatherAlert } from '../types'
import { allNews, newsNote, useTrip } from './useTrip'

const filters = [
  { key: 'all', label: 'All' },
  { key: 'pagasa', label: 'PAGASA' },
  { key: 'lgu', label: 'LGU' },
  { key: 'campus', label: 'Campus' },
  { key: 'classes', label: 'Classes' },
  { key: 'news', label: 'Local news' },
  { key: 'forecast', label: 'Forecast' },
] as const
type Filter = (typeof filters)[number]['key']
const isFilter = (v: string | null): v is Filter => filters.some((f) => f.key === v)
const sourceIcon = { PAGASA: CloudRain, LGU: Building2, Campus: Megaphone }
const severity: Record<Severity, { label: string; level: Level }> = {
  info: { label: 'Info', level: 'none' },
  warning: { label: 'Warning', level: 'mid' },
  critical: { label: 'Critical', level: 'high' },
}
const CLASS_RE = /\bclass(es)?\b|walang pasok|suspen/i
const alertLevel = (sev: string): Level => (/EXTREME|SEVERE/i.test(sev) ? 'high' : /MODERATE/i.test(sev) ? 'mid' : 'none')
const titleCase = (v: string) => v.toLowerCase().replace(/^./, (c) => c.toUpperCase())

// Filter chips change the hash in place (no new history entry), so the filter survives a refresh and deep links work.
const pick = (f: Filter) => location.replace(hrefOf('alerts', null, f === 'all' ? null : `filter=${f}`))

export default function Alerts({ filterParam }: { filterParam: string | null }) {
  const { s, now, view, routes } = useTrip()
  const filter: Filter = isFilter(filterParam) ? filterParam : 'all'
  const show = (f: Filter) => filter === 'all' || filter === f
  const keep = (a: Advisory) => filter === 'all' || (filter === 'classes' ? CLASS_RE.test(`${a.title} ${a.body}`) : a.source.toLowerCase() === filter)
  const mine = studentAdvisories(s.snapshot.advisories, s.corridorId, now).filter(keep)
  const others = otherCorridorAdvisories(s.snapshot.advisories, s.corridorId, now).filter(keep)
  const ended = recentlyEnded(s.snapshot.advisories, s.corridorId, now).filter(keep)
  const warnings = show('pagasa') ? currentAlerts(s.weather?.alerts, now) : []
  const rain = rainNotice(s.weather?.hourly, s.weather?.fetchedAt ?? 0, now)
  const notices = show('forecast') ? [...(rain ? [rain] : []), ...trafficNotices(routes)] : []
  // Local news: every Batangas report, those naming this campus or your route first. Classes: class news only.
  const places = placesFor(ACTIVE_CAMPUS.id, s.corridorId)
  const near = (n: { places: string[] }) => n.places.some((p) => places.has(p))
  const everyNews = allNews(s, now)
  const sorted = [...everyNews].sort((a, b) => Number(near(b)) - Number(near(a)) || b.publishedAt - a.publishedAt)
  const news = filter === 'news' || filter === 'all' ? sorted : filter === 'classes' ? sorted.filter((n) => n.topics.includes('classes')) : []
  const note = newsNote(s, now)
  const label = filters.find((f) => f.key === filter)!.label
  // A deep-linked filter (e.g. Local news) may sit past the edge of a phone screen: bring its chip into view.
  useEffect(() => {
    document.querySelector('.filters [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [filter])

  const warning = (a: WeatherAlert) => (
    <li key={a.id}>
      <article className="card alert" aria-labelledby={`w-${a.id}`}>
        <div className="alert-head">
          <span className="chip-label"><ShieldAlert size={14} aria-hidden="true" />{a.authority}</span>
          <span className="chip-label"><Lvl level={alertLevel(a.severity)}>{titleCase(a.severity)}</Lvl></span>
          <Badge kind={view.offline ? 'saved' : 'official'} />
          {a.startAt != null && <span className="caption alert-time">{ago(a.startAt, now)}</span>}
        </div>
        <h2 className="h3" id={`w-${a.id}`}>{a.title}</h2>
        {a.description && <p className="body">{a.description}</p>}
        {a.instructions.length > 0 && <ul className="body bullets">{a.instructions.map((i) => <li key={i}>{i}</li>)}</ul>}
        <p className="caption">
          Issued by {a.authority}{a.areaName ? ` for ${a.areaName}` : ''}{a.startAt != null ? ` · from ${clock(a.startAt)}` : ''}{a.expiresAt != null ? ` · until ${clock(a.expiresAt)}` : ''} · via Google Weather
          {a.authorityUrl && <> · <a href={a.authorityUrl} target="_blank" rel="noopener noreferrer">Source<ExternalLink size={12} aria-hidden="true" /><span className="sr-only"> (opens {a.authority} in a new tab)</span></a></>}
        </p>
      </article>
    </li>
  )

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
            {a.simulated && <Badge kind="simulated" />}
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

  const nothing = mine.length + others.length + warnings.length + notices.length + news.length === 0

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="h1">Alerts</h1>
        <p className="meta">PAGASA, LGU and campus advisories, forecasts and local news.</p>
      </div>
      {!view.offline && view.stale && (
        <p className="banner"><Clock size={20} aria-hidden="true" /><span>Last update {ago(s.snapshot.updatedAt, now)}. Advisories may have changed.</span></p>
      )}
      <div className="chips chips-scroll filters" role="group" aria-label="Filter alerts">
        {filters.map((f) => (
          <button key={f.key} type="button" className="chip" aria-pressed={filter === f.key} onClick={() => pick(f.key)}>
            {f.key === 'classes' && <GraduationCap size={16} aria-hidden="true" />}
            {f.label}
            {f.key === 'news' && everyNews.length > 0 && <span className="count">{everyNews.length}<span className="sr-only"> articles</span></span>}
          </button>
        ))}
      </div>

      {nothing && (
        <section className="card empty">
          <CircleCheck size={24} aria-hidden="true" />
          <h2 className="h2">{filter === 'all' ? 'No active alerts' : filter === 'news' ? 'No local news right now' : `Nothing under ${label} right now`}</h2>
          <p className="body">{filter === 'news' ? note ?? 'Batangas flood, road, weather and class reports appear here.' : 'New advisories appear here and stay readable offline.'}</p>
        </section>
      )}

      {mine.length > 0 && (
        <section className="stack" aria-labelledby="for-you">
          <h2 className="eyebrow" id="for-you">For you and your route <Badge kind={view.offline ? 'saved' : mine.every((a) => a.simulated) ? 'simulated' : 'official'} /></h2>
          <ul className="stack">{mine.map((a) => card(a, true))}</ul>
        </section>
      )}

      {warnings.length > 0 && (
        <section className="stack" aria-labelledby="warnings">
          <h2 className="eyebrow" id="warnings">Weather warnings</h2>
          <ul className="stack">{warnings.map(warning)}</ul>
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
                    <Badge kind={view.offline ? 'saved' : 'estimate'} />
                  </div>
                  <h3 className="h3" id={`n-${n.id}`}>{n.title}</h3>
                  <p className="body">{n.detail}</p>
                  <p className="caption">From {n.source} · {clock(n.at)}. Not an official advisory.</p>
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

      {news.length > 0 && (
        <section className="stack" aria-labelledby="news">
          <h2 className="eyebrow" id="news">Local news</h2>
          <section className="card">
            <ul className="list">
              {news.map((n) => (
                <li key={n.id}><NewsArticleRow item={n} now={now} offline={view.offline} savedAt={s.news?.fetchedAt ?? now} /></li>
              ))}
            </ul>
            <NewsCredit />
            {note && <p className="caption">{note}</p>}
          </section>
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
