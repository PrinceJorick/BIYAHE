// Map (wireframes 3 and 4): the map fills the screen above the app's bottom navigation. Phones: the place sits in
// a chip at the top and one Details button just above the navigation opens the details (where it goes, how long
// it takes now, when to leave, map layers, every other place) at the top of the map. Wide screens: the details
// sit in a panel on the left, open.
import { ArrowRight, Building2, ChevronUp, CloudRain, Layers, Route as RouteIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import Badge from '../components/Badge'
import Lvl from '../components/Lvl'
import MapView from '../components/map/MapView'
import { TimeCompare, TrafficSource, TrafficWord } from '../components/places'
import WalkPanel from '../components/WalkPanel'
import { fmtRange, spaceText } from '../lib/derive'
import { GOOGLE_MAPS_KEY } from '../lib/googleRoutes'
import { useGoogleMapsStatus } from '../lib/googleMapsLoader'
import { findPlace, placeArg, placeShort, placeTitle, walkText, type Place, type RoutePlace } from '../lib/places'
import { go, hrefOf, useMedia } from '../lib/router'
import { isLowBattery, isOffline, loadDepartures, loadWalkRoute, selectSpot } from '../lib/store'
import { departureOptions, levelOfTraffic, rainLevel, trafficWord } from '../lib/traffic'
import { useTrip } from './useTrip'

const LAYERS_KEY = 'biyahe-map-layers'

function readLayers(): { traffic: boolean; all: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(LAYERS_KEY) ?? '{}')
    return { traffic: v.traffic === true, all: v.all === true }
  } catch {
    return { traffic: false, all: false }
  }
}

const timeFmt = (t: number) => new Date(t).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

function Departures({ r }: { r: RoutePlace }) {
  const { s, now } = useTrip(60_000)
  const net = !isOffline(s) && !isLowBattery(s)
  useEffect(() => {
    if (net) void loadDepartures(r.id)
  }, [r.id, net])
  const forecast = s.departures[r.id]?.forecast
  const options = departureOptions(r.corridor, r.cs, now, s.weather?.hourly, s.traffic?.routes[r.id], forecast)
  const closed = r.cs.status === 'closed'
  const anyLive = options.some((o) => o.offsetMin > 0 && o.traffic.source === 'live')
  return (
    <section className="sheet-section" aria-labelledby="when">
      <h3 className="h3" id="when">When should I leave?</h3>
      {closed ? <p className="body">{r.corridor.via} is closed. Wait on campus until an advisory reopens it; this list updates when it does.</p> : null}
      <table className="when">
        <thead>
          <tr><th scope="col">Leave</th><th scope="col">Trip</th><th scope="col">Traffic</th><th scope="col"><CloudRain size={14} aria-hidden="true" /><span className="sr-only">Chance of </span>Rain</th></tr>
        </thead>
        <tbody>
          {options.map((o) => (
            <tr key={o.offsetMin} className={o.best ? 'when-best' : undefined}>
              <th scope="row">{o.offsetMin === 0 ? 'Now' : timeFmt(o.at)}{o.best && <span className="tag">Best</span>}</th>
              <td>{closed ? '–' : fmtRange(o.traffic.minLo, o.traffic.minHi)}</td>
              <td><Lvl level={levelOfTraffic[o.traffic.level]}>{trafficWord[o.traffic.level]}</Lvl></td>
              <td><Lvl level={rainLevel(o.rainPct)}>{o.rainPct == null ? '–' : `${o.rainPct}%`}</Lvl></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="caption">
        {anyLive ? 'Later trips use Google\'s traffic forecast' : 'Later trips assume today\'s conditions continue'}; rain chance from the Google Weather forecast.
        {!closed && ' Best balances time on the road and rain; waiting on campus counts for less.'}
      </p>
    </section>
  )
}

function Summary({ place, saved }: { place: Place; saved: boolean }) {
  if (place.kind === 'route') {
    return (
      <>
        <div className="card-head">
          <p className="eyebrow">{place.mine ? 'Your route home' : 'Route'}</p>
          <TrafficSource t={place.traffic} saved={saved} />
        </div>
        <h2 className="h1" id="sheet-title">{place.corridor.name}</h2>
        <p className="meta">via {place.corridor.via} · <TrafficWord t={place.traffic} suffix=" traffic" /></p>
        <TimeCompare route={place} label="Right now" />
      </>
    )
  }
  return (
    <>
      <div className="card-head">
        <p className="eyebrow">Safe spot</p>
        <Badge kind={saved ? 'saved' : 'official'} />
      </div>
      <h2 className="h1" id="sheet-title">{place.spot.name}</h2>
      <p className="meta">{walkText(place.spot.walkMin)} · <Lvl level={place.full ? 'high' : 'none'}>{spaceText(place.spot)}</Lvl></p>
    </>
  )
}

export default function MapScreen({ arg }: { arg: string | null }) {
  const { s, view, routes, spots } = useTrip()
  const wide = useMedia('(min-width: 900px)')
  const gm = useGoogleMapsStatus()
  const [open, setOpen] = useState(wide)
  // Crossing the wide breakpoint resets the panel: open beside the map on wide screens, collapsed on phones.
  const [wasWide, setWasWide] = useState(wide)
  if (wasWide !== wide) {
    setWasWide(wide)
    setOpen(wide)
  }
  const [layers, setLayers] = useState(readLayers)

  // No destination in the URL: the student's own route (or the nearest safe spot when it is closed).
  const mine = routes.find((r) => r.mine) ?? routes[0]
  const fallback: Place = mine.cs.status === 'closed' ? spots.find((x) => !x.full) ?? mine : mine
  const place = findPlace(arg, routes, spots) ?? fallback
  const saved = view.provenance === 'saved'
  const googleOn = Boolean(GOOGLE_MAPS_KEY) && !isOffline(s) && !isLowBattery(s) && gm !== 'error'
  const net = !isOffline(s) && !isLowBattery(s)

  const spotId = place.kind === 'spot' ? place.id : null
  const [lat, lng] = place.kind === 'spot' ? place.spot.pos : [null, null]
  useEffect(() => {
    if (!spotId || lat == null || lng == null) return
    selectSpot(spotId)
    void loadWalkRoute({ id: spotId, pos: [lat, lng] })
  }, [spotId, lat, lng, net])

  const setLayer = (k: 'traffic' | 'all', v: boolean) => {
    const next = { ...layers, [k]: v }
    setLayers(next)
    try {
      localStorage.setItem(LAYERS_KEY, JSON.stringify(next))
    } catch {
      // storage blocked: the choice lasts for this visit
    }
  }

  // Escape collapses the details on phones (focus stays on the toggle, which reports the new state).
  useEffect(() => {
    if (!open || wide) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, wide])

  // Phones: the details sit above the map, not over it, so only the map's own notes need room.
  const padding = wide
    ? { top: 80, right: 72, bottom: 48, left: open ? 440 : 96 }
    : { top: open ? Math.round(innerHeight * 0.55) + 16 : 112, right: 56, bottom: 88, left: 24 }
  const show = (p: Place) => go('map', placeArg(p))

  const status = place.kind === 'route'
    ? <TrafficWord t={place.traffic} />
    : <Lvl level={place.full ? 'high' : 'low'}>{place.full ? 'Full' : 'Open'}</Lvl>

  return (
    <div className={`mapscreen${open ? ' is-open' : ''}`}>
      <h1 className="sr-only">Map: {placeTitle(place)}</h1>

      <div id="trip-panel" className="sheet" role="region" aria-labelledby="sheet-title" hidden={!open}>
        <div className="sheet-body">
          <section className="sheet-section">
            <Summary place={place} saved={saved} />
            <a className="btn btn-primary btn-block" href={hrefOf('go', placeArg(place))}>Full details<ArrowRight size={18} aria-hidden="true" /></a>
          </section>

          {place.kind === 'route' && <Departures r={place} />}
          {place.kind === 'spot' && <WalkPanel spot={place.spot} route={s.walk?.spotId === place.id ? s.walk : null} loading={s.walkLoading === place.id} headingLevel={3} />}

          <section className="sheet-section" aria-labelledby="places-title">
            <h3 className="h3" id="places-title">Show on the map</h3>
            <div className="chips chips-scroll" role="group" aria-labelledby="places-title">
              {[...routes, ...spots].map((p) => {
                const on = p.kind === place.kind && p.id === place.id
                return (
                  <button key={placeArg(p)} type="button" className="chip" aria-pressed={on} onClick={() => show(p)}>
                    {p.kind === 'route' ? <RouteIcon size={16} aria-hidden="true" /> : <Building2 size={16} aria-hidden="true" />}
                    {placeShort(p)}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="sheet-section" aria-labelledby="layers-title">
            <h3 className="h3" id="layers-title">Map layers</h3>
            <div className="switches">
              <label className="switch">
                <input type="checkbox" role="switch" checked={layers.all} onChange={(e) => setLayer('all', e.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
                <span><span className="strong">All routes</span><span className="caption">Every route home from campus</span></span>
              </label>
              <label className={`switch${googleOn ? '' : ' is-disabled'}`}>
                <input type="checkbox" role="switch" checked={layers.traffic && googleOn} disabled={!googleOn} onChange={(e) => setLayer('traffic', e.target.checked)} />
                <span className="switch-track" aria-hidden="true" />
                <span><span className="strong">Live traffic</span><span className="caption">{googleOn ? 'Google traffic on the roads' : 'Needs the Google street map'}</span></span>
              </label>
            </div>
          </section>
        </div>
      </div>

      <div className="mapscreen-map">
        <MapView mode="student" fill focus={{ kind: place.kind, id: place.id }} showAll={layers.all} traffic={layers.traffic && googleOn} padding={padding}
          label={`Map of ${placeTitle(place)}. The same information is in the trip panel.`}
          onSpot={(id) => go('map', `spot/${id}`)} />
      </div>

      {!open && (
        <p className="map-chip" aria-hidden="true">
          {place.kind === 'route' ? <RouteIcon size={16} /> : <Building2 size={16} />}
          <span className="map-chip-name">{placeShort(place)}</span>
          {status}
        </p>
      )}
      <button type="button" className="map-trigger" aria-expanded={open} aria-controls="trip-panel"
        aria-label={wide ? (open ? 'Close the trip panel' : 'Open the trip panel') : undefined} onClick={() => setOpen(!open)}>
        {wide
          ? (open ? <ArrowRight size={22} className="flip" aria-hidden="true" /> : <Layers size={22} aria-hidden="true" />)
          : <>{open ? <ChevronUp size={20} aria-hidden="true" /> : <Layers size={20} aria-hidden="true" />}{open ? 'Hide details' : 'Show details'}</>}
      </button>
    </div>
  )
}