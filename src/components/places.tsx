// Building blocks for showing places (routes home and safe spots) the same way on every screen.
import { Building2, ChevronRight, House, Route as RouteIcon } from 'lucide-react'
import { fmtMin, fmtRange } from '../lib/derive'
import { placeArg, placeFacts, type Place, type RoutePlace } from '../lib/places'
import { hrefOf } from '../lib/router'
import { useApp } from '../lib/store'
import { levelOfTraffic, trafficWord, type TrafficReading } from '../lib/traffic'
import Badge from './Badge'
import Lvl from './Lvl'

export function PlaceIcon({ place, size = 20 }: { place: Place; size?: number }) {
  const Icon = place.kind === 'spot' ? Building2 : place.mine ? House : RouteIcon
  return <Icon size={size} aria-hidden="true" />
}

/** "Light", "Heavy", "Closed": the traffic word in its level colour. */
export const TrafficWord = ({ t, suffix = '' }: { t: TrafficReading; suffix?: string }) => (
  <Lvl level={levelOfTraffic[t.level]}>{trafficWord[t.level]}{t.level === 'closed' || t.level === 'unknown' ? '' : suffix}</Lvl>
)

/** Where a traffic reading came from. A closure from the demo data is labelled simulated, never official. */
export function TrafficSource({ t, saved }: { t: TrafficReading; saved?: boolean }) {
  const simulated = useApp().backend === 'device'
  return saved ? <Badge kind="saved" /> : t.source === 'live' ? <Badge kind="live" label="Live traffic" /> : t.source === 'official' ? <Badge kind={simulated ? 'simulated' : 'official'} /> : <Badge kind="estimate" />
}

/** A row in a place list: icon, name, facts, level word, chevron. Links to the place's details. */
export function PlaceRow({ place }: { place: Place }) {
  const title = place.kind === 'route' ? place.corridor.name : place.spot.name
  return (
    <a className="item" href={hrefOf('go', placeArg(place))}>
      <span className="item-icon"><PlaceIcon place={place} /></span>
      <span className="item-body">
        <span className="item-title">{title}</span>
        <span className="meta">{place.kind === 'route' && place.mine && <span className="strong mine">Your route · </span>}{placeFacts(place)}</span>
      </span>
      <span className="item-end">
        {place.kind === 'route' ? <TrafficWord t={place.traffic} /> : <Lvl level={place.full ? 'high' : 'none'}>{place.full ? 'Full' : 'Open'}</Lvl>}
      </span>
      <ChevronRight className="item-chev" size={18} aria-hidden="true" />
    </a>
  )
}

/**
 * Travel time now against the usual time: two figures and a neutral bar with a "usual" tick (wireframe 2).
 * `label` names the route ("Lipa City, right now").
 */
export function TimeCompare({ route, label }: { route: RoutePlace; label: string }) {
  const { traffic: t, corridor: c } = route
  const mid = (t.minLo + t.minHi) / 2
  const max = Math.max(c.usualMin * 2, t.minHi)
  return (
    <div className="times">
      <dl className="times-row">
        <div>
          <dt className="meta">{label}</dt>
          <dd className="num">{fmtRange(t.minLo, t.minHi).replace(/ /g, '\u00a0')}</dd>
        </div>
        <div className="times-usual">
          <dt className="meta">Usual</dt>
          <dd className="h2">{fmtMin(c.usualMin).replace(/ /g, '\u00a0')}</dd>
        </div>
      </dl>
      <div className="timebar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, (mid / max) * 100)}%` }} />
        <b style={{ left: `${(c.usualMin / max) * 100}%` }}><span>usual</span></b>
      </div>
    </div>
  )
}
