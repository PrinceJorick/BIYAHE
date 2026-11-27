// "Notifications" card: official advisories, then the app's own forecast/traffic notices, then news headlines.
// Each row names its source; only official advisories are called advisories.
import { Building2, CloudRain, ExternalLink, Gauge, Megaphone, Newspaper } from 'lucide-react'
import type { Advisory } from '../types'
import { ago } from '../lib/derive'
import type { NewsItem } from '../lib/news'
import type { Notice } from '../lib/notices'
import type { Level } from '../lib/traffic'
import Lvl from './Lvl'

const sevLevel: Record<Advisory['severity'], Level> = { info: 'none', warning: 'mid', critical: 'high' }
const sevWord: Record<Advisory['severity'], string> = { info: 'Info', warning: 'Warning', critical: 'Critical' }
const sourceIcon = { PAGASA: CloudRain, LGU: Building2, Campus: Megaphone }

export default function Notifications({ advisories, notices, news, now, empty, newsNote }: {
  advisories: Advisory[]; notices: Notice[]; news: NewsItem[]; now: number; empty: string; newsNote?: string | null
}) {
  const none = advisories.length + notices.length + news.length === 0
  return (
    <section className="card" aria-labelledby="notif-title">
      <div>
        <h2 className="h2" id="notif-title">Notifications</h2>
        <p className="meta">Advisories, forecasts, traffic and local news</p>
      </div>
      {none ? <p className="body">{empty}</p> : (
        <ul className="list">
          {advisories.map((a) => {
            const Icon = sourceIcon[a.source]
            return (
              <li key={a.id}>
                <a className="item item-top" href="#/alerts">
                  <span className="item-icon"><Icon size={20} aria-hidden="true" /></span>
                  <span className="item-body">
                    <span className="caption"><Lvl level={sevLevel[a.severity]} className="strong">{sevWord[a.severity]}</Lvl> · {a.issuer} · {ago(a.issuedAt, now)}{a.simulated ? ' · Simulated' : ''}</span>
                    <span className="item-title">{a.title}</span>
                  </span>
                </a>
              </li>
            )
          })}
          {notices.map((n) => (
            <li key={n.id}>
              <div className="item item-top">
                <span className="item-icon">{n.kind === 'rain' ? <CloudRain size={20} aria-hidden="true" /> : <Gauge size={20} aria-hidden="true" />}</span>
                <span className="item-body">
                  <span className="caption"><Lvl level={n.level} className="strong">{n.word}</Lvl> · {n.source}</span>
                  <span className="item-title">{n.title}</span>
                  <span className="meta">{n.detail}</span>
                </span>
              </div>
            </li>
          ))}
          {news.map((n) => (
            <li key={n.id}>
              <a className="item item-top" href={n.url} target="_blank" rel="noreferrer">
                <span className="item-icon"><Newspaper size={20} aria-hidden="true" /></span>
                <span className="item-body">
                  <span className="caption">News · {n.source} · {ago(n.publishedAt, now)}</span>
                  <span className="item-title">{n.title}</span>
                </span>
                <ExternalLink className="item-chev" size={16} aria-hidden="true" /><span className="sr-only"> (opens the article)</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {newsNote && <p className="caption">{newsNote}</p>}
    </section>
  )
}
