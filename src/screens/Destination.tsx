// Details for one place (wireframe 2): #/go/route/<id> or #/go/spot/<id>. A clear answer first ("Head home now."
// or "Wait on campus for now."), the travel time against the usual one, then notifications from advisories,
// forecasts, traffic and news, and the nearest other places to go. "View on map" opens the full map.
import { ArrowLeft, CircleCheck, CircleHelp, Clock, Droplet, Map as MapIcon, Send, TriangleAlert, Utensils, Zap } from 'lucide-react'
import { useEffect } from 'react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import Badge from '../components/Badge'
import Lvl from '../components/Lvl'
import MapView from '../components/map/MapView'
import Notifications from '../components/Notifications'
import { PlaceRow, TimeCompare, TrafficSource } from '../components/places'
import WalkPanel from '../components/WalkPanel'
import type { Amenity } from '../data'
import { ago, amenityLabel, fmtMin, spaceText } from '../lib/derive'
import { findPlace, placeArg, walkText, type RoutePlace, type SpotPlace } from '../lib/places'
import { go, hrefOf, useMedia } from '../lib/router'
import { routeLevel, routeMessage } from '../lib/routeStatus'
import { DEMO_DATA, isLowBattery, isOffline, loadWalkRoute, refresh, selectSpot, toast } from '../lib/store'
import { placeNotifications, useTrip } from './useTrip'

const amenityIcon: Record<Amenity, typeof Zap> = { power: Zap, water: Droplet, food: Utensils }

function Back() {
  return <a className="back" href="#/home"><ArrowLeft size={18} aria-hidden="true" />Home</a>
}

function RouteHero({ r, saved, meta, simulated }: { r: RoutePlace; saved: boolean; meta: string; simulated: boolean }) {
  const st = r.cs.status
  const title = st === 'closed' ? 'Wait on campus for now.' : st === 'unknown' ? 'Check before you go.' : st === 'slow' ? 'Expect delays.' : r.mine ? 'Head home now.' : 'Route clear.'
  const Icon = st === 'closed' ? TriangleAlert : st === 'unknown' ? CircleHelp : st === 'slow' ? Clock : CircleCheck
  return (
    <section className="card hero" aria-labelledby="decision">
      <div className="card-head">
        <p className="eyebrow">{r.mine ? 'Your journey home' : `Route to ${r.corridor.name}`}</p>
        <Badge kind={saved ? 'saved' : simulated ? 'simulated' : r.cs.provenance} />
      </div>
      <h1 id="decision" className="display">{title}</h1>
      <div className="stack-xs">
        <p className="status"><Lvl level={routeLevel[st]}><Icon size={18} aria-hidden="true" />{routeMessage(r.cs)}</Lvl></p>
        <p className="body">{st === 'unknown' ? <>{r.cs.note} <a href="#/alerts">See alerts</a></> : r.cs.note}</p>
      </div>
      {st !== 'unknown' && <><hr className="rule" /><TimeCompare route={r} label={`${r.corridor.name}, ${saved ? 'last known' : 'now'}`} /></>}
      <p className="caption hero-meta"><Clock size={14} aria-hidden="true" />{meta}</p>
    </section>
  )
}

function SpotHero({ p, saved }: { p: SpotPlace; saved: boolean }) {
  const x = p.spot
  const amenities = (Object.keys(amenityLabel) as Amenity[]).filter((a) => x.amenities[a])
  return (
    <section className="card hero" aria-labelledby="decision">
      <div className="card-head">
        <p className="eyebrow">Waiting area · {ACTIVE_CAMPUS.shortName}</p>
        <Badge kind={saved ? 'saved' : 'official'} />
      </div>
      <h1 id="decision" className="display">{x.name}</h1>
      <p className="status"><Lvl level={p.full ? 'high' : 'low'}>{p.full ? <TriangleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}{p.full ? 'Full: choose another place' : 'Open for waiting'}</Lvl></p>
      <hr className="rule" />
      <dl className="facts">
        <div><dt className="meta">Walk</dt><dd className="h2">{walkText(x.walkMin)}</dd><dd className="caption">Straight-line estimate</dd></div>
        <div><dt className="meta">Space</dt><dd className="h2">{x.capacity == null ? 'Not assessed' : p.full ? 'Full' : `${x.capacity - x.occupied} left`}</dd><dd className="caption">{spaceText(x)}</dd></div>
      </dl>
      {x.capacity != null && <div className="meter" aria-hidden="true"><i style={{ width: `${Math.min(100, (x.occupied / x.capacity) * 100)}%` }} /></div>}
      <ul className="amenities" aria-label="Amenities">
        {amenities.length === 0 ? <li className="meta">No amenities confirmed yet</li> : amenities.map((a) => {
          const A = amenityIcon[a]
          return <li key={a}><A size={16} aria-hidden="true" />{amenityLabel[a]}</li>
        })}
      </ul>
    </section>
  )
}

export default function Destination({ arg }: { arg: string | null }) {
  const { s, now, view, routes, spots } = useTrip()
  const wide = useMedia('(min-width: 1100px)')
  const place = findPlace(arg, routes, spots)
  const saved = view.provenance === 'saved'
  const spotId = place?.kind === 'spot' ? place.id : null
  const [lat, lng] = place?.kind === 'spot' ? place.spot.pos : [null, null]
  const net = !isOffline(s) && !isLowBattery(s)

  // Opening a safe spot selects it (the map and share message follow) and looks up the walking route.
  useEffect(() => {
    if (!spotId || lat == null || lng == null) return
    selectSpot(spotId)
    void loadWalkRoute({ id: spotId, pos: [lat, lng] })
  }, [spotId, lat, lng, net])

  if (!place) {
    return (
      <div className="page">
        <Back />
        <section className="card"><h1 className="h1">Place not found</h1><p className="body">It may be on another campus. Pick a place from Home.</p></section>
      </div>
    )
  }

  const n = placeNotifications(s, place, now)
  const meta = view.offline ? `Saved ${fmtMin(view.ageMin)} ago · reconnect to refresh`
    : view.stale ? `${fmtMin(view.ageMin)} old · waiting for an update`
      : `Updated ${ago(s.snapshot.updatedAt, now)} · ${place.kind === 'route' ? place.cs.source : 'Campus DRRMO'}${DEMO_DATA ? ' (simulated)' : ''}`
  const nearby = place.kind === 'route'
    ? (place.cs.status === 'closed' || place.cs.status === 'unknown' ? spots.filter((x) => !x.full) : [...spots.filter((x) => !x.full).slice(0, 1), ...routes.filter((r) => r.id !== place.id && (r.cs.status === 'open' || r.cs.status === 'slow'))]).slice(0, 4)
    : spots.filter((x) => x.id !== place.id)
  const waitHere = place.kind === 'spot' || place.cs.status === 'closed' || place.cs.status === 'unknown'

  return (
    <div className={`detail${wide ? ' detail-wide' : ''}`}>
      <div className="page">
        <Back />
        {place.kind === 'route' ? <RouteHero r={place} saved={saved} meta={meta} simulated={DEMO_DATA} /> : <SpotHero p={place} saved={saved} />}

        {place.kind === 'route' && (place.cs.status === 'open' || place.cs.status === 'slow') && (
          <section className="card" aria-labelledby="traffic-now">
            <div className="card-head">
              <h2 className="h2" id="traffic-now">Traffic now</h2>
              <TrafficSource t={place.traffic} saved={saved} />
            </div>
            <p className="body">
              {place.traffic.source === 'live'
                ? `Live traffic: ${Math.round(place.traffic.ratio * 100 - 100)}% over free-flow. Your usual ${fmtMin(place.corridor.usualMin)} becomes about ${place.traffic.minLo}–${place.traffic.minHi} min.`
                : `From route reports${s.trafficError ? ' (live traffic unavailable)' : ''}: usual time adjusted for the reported status.`}
            </p>
            {view.stale && !view.offline && (
              <button className="btn btn-quiet btn-sm" onClick={async () => { if (!(await refresh())) toast('No newer update yet.') }}>Check for an update</button>
            )}
          </section>
        )}

        {place.kind === 'spot' && <WalkPanel spot={place.spot} route={s.walk?.spotId === place.id ? s.walk : null} loading={s.walkLoading === place.id} />}

        <Notifications advisories={n.advisories} notices={n.notices} news={n.news} now={now} newsNote={n.newsNote}
          empty="No alerts for this place." />

        {nearby.length > 0 && (
          <section className="card" aria-labelledby="nearby">
            <div>
              <h2 className="h2" id="nearby">{waitHere ? 'Other places to wait' : 'Nearest places to go'}</h2>
              <p className="meta">{waitHere ? 'Safe spots with room, nearest first' : 'A safe spot and other clear routes'}</p>
            </div>
            <ul className="list">{nearby.map((p) => <li key={placeArg(p)}><PlaceRow place={p} /></li>)}</ul>
          </section>
        )}

        <div className="actions">
          <a className="btn btn-primary" href={hrefOf('map', placeArg(place))}><MapIcon size={20} aria-hidden="true" />View on map</a>
          <a className="btn btn-secondary" href="#/share"><Send size={20} aria-hidden="true" />{waitHere ? "Tell family I'm safe" : "Tell family I'm heading home"}</a>
        </div>
      </div>
      {wide && (
        <aside className="detail-map" aria-label="Map">
          <MapView mode="student" focus={{ kind: place.kind, id: place.id }} label={`Map of ${place.kind === 'route' ? `the route to ${place.corridor.name}` : place.spot.name}. The same information is listed in text.`}
            onSpot={(id) => go('go', `spot/${id}`)} />
        </aside>
      )}
    </div>
  )
}
