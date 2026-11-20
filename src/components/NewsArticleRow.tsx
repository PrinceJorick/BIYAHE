// One local-news article, the same everywhere it appears (Home, Alerts, Coordinator).
// Online: a real link to the publisher's article in a new tab, marked read on this device.
// Offline: the saved copy in a sheet (headline, description, publisher, saved time), never a dead link.
import { ExternalLink, Newspaper, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { clock } from '../lib/derive'
import { CURRENTS_CREDIT, isSafeArticleUrl, relTime, type NewsItem } from '../lib/news'
import { markNewsRead, toast } from '../lib/store'
import Badge from './Badge'
import Dialog from './Dialog'

export default function NewsArticleRow({ item, now, offline, savedAt, compact = false }: {
  item: NewsItem
  now: number
  offline: boolean
  /** When the saved copy was fetched (shown offline). */
  savedAt: number
  /** One-line rows (Coordinator monitor): no description. */
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const when = <time dateTime={new Date(item.publishedAt).toISOString()}>{relTime(item.publishedAt, now)}</time>
  const body = (
    <>
      <span className="item-icon"><Newspaper size={20} aria-hidden="true" /></span>
      <span className="item-body">
        <span className="h3 item-title">{item.title}{!offline && <span className="sr-only"> — opens article on {item.source} in a new tab</span>}</span>
        {!compact && item.summary && <span className="meta clamp-2">{item.summary}</span>}
        <span className="caption news-meta">
          Local news · {item.source}{!offline && <ExternalLink size={14} aria-hidden="true" />} · {when}
          {offline && <Badge kind="saved" />}
        </span>
      </span>
    </>
  )

  if (!offline && isSafeArticleUrl(item.url)) {
    return (
      <a className="item item-top" href={item.url} target="_blank" rel="noopener noreferrer" onClick={() => markNewsRead(item.id)}>
        {body}
      </a>
    )
  }

  return (
    <>
      <button type="button" className="item item-top" aria-haspopup="dialog"
        onClick={() => {
          setOpen(true)
          toast(`You're offline. Showing the saved copy from ${item.source}.`)
        }}>
        {body}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={item.title}>
        <p className="cluster meta"><Badge kind="saved" /> Local news · {item.source} · published {when}</p>
        {item.summary && <p className="body">{item.summary}</p>}
        <p className="banner"><WifiOff size={20} aria-hidden="true" /><span>Connect to the internet to read the full article on {item.source}.</span></p>
        <p className="caption">Saved on this device at {clock(savedAt)}. A news report, not an official advisory. <a href={CURRENTS_CREDIT.url} target="_blank" rel="noopener noreferrer">{CURRENTS_CREDIT.label}</a></p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" disabled aria-disabled="true">
            <ExternalLink size={18} aria-hidden="true" />Open on {item.source}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>Close</button>
        </div>
      </Dialog>
    </>
  )
}

/** Attribution under every news list: the provider, and that these are reports, not advisories. */
export function NewsCredit() {
  return (
    <p className="caption">
      News reports from their publishers, not official advisories. <a href={CURRENTS_CREDIT.url} target="_blank" rel="noopener noreferrer">{CURRENTS_CREDIT.label}</a>
    </p>
  )
}
