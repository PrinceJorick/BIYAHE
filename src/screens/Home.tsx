import { Bell, ChevronRight, CircleCheck, Clock, CloudRain, CloudSun, MapPin, RefreshCw, Send, TriangleAlert } from 'lucide-react'
import Badge from '../components/Badge'
import { studentAdvisories } from '../lib/advisories'
import { ago, amenityList, clock, fmtMin, fmtRange, spacesLeft, studentView } from '../lib/derive'
import { walkEstimate } from '../lib/mapView'
import { refresh, toast, useApp, useNow } from '../lib/store'

export default function Home() {
  const s = useApp()
  const now = useNow()
  const v = studentView(s, now)
  const { cs, corridor, spot } = v
  const saved = v.provenance === 'saved'
  const wait = v.decision === 'wait'
  const tone = saved ? 'saved' : wait ? 'danger' : cs.status === 'slow' ? 'warn' : 'ok'
  const StatusIcon = wait ? TriangleAlert : cs.status === 'slow' ? Clock : CircleCheck
  const routeWord = wait ? 'route disrupted' : cs.status === 'slow' ? 'route slow' : 'route clear'
  const status = saved ? `Last known: ${routeWord}` : routeWord[0].toUpperCase() + routeWord.slice(1)
  const WeatherIcon = s.weather.precipMm > 0 ? CloudRain : CloudSun
  const alerts = studentAdvisories(s.snapshot.advisories, s.corridorId, now)

  const meta = v.offline
    ? `${fmtMin(v.ageMin)} old · reconnect to refresh`
    : v.stale
      ? `${fmtMin(v.ageMin)} old · waiting for a fresh update`
      : `Updated ${ago(s.snapshot.updatedAt, now)} · ${cs.source}`

  const whereToWait = <a className={`btn btn-block ${wait ? 'btn-primary' : 'btn-secondary'}`} href="#/map"><MapPin size={20} aria-hidden="true" />See Where to Wait</a>
  const share = (
    <a className={`btn btn-block ${wait ? 'btn-secondary' : 'btn-primary'}`} href="#/share">
      <Send size={20} aria-hidden="true" />{wait ? "Share I'm Safe" : "Share I'm heading home"}
    </a>
  )

  return (
    <div className="page">
      <section className={`hero tone-${tone}`} aria-labelledby="decision">
        <div className="between">
          <span className="status"><StatusIcon size={20} aria-hidden="true" />{status}</span>
          <Badge kind={v.provenance} />
        </div>
        <h1 id="decision" className="hero-title">{wait ? 'Wait on Campus for Now' : 'Head Home Now'}</h1>
        <p>{cs.note}</p>
        <dl className="times">
          <div>
            <dt>{corridor.name}, {saved ? 'last known' : 'right now'}</dt>
            <dd className="num">{fmtRange(cs.minLo, cs.minHi)}</dd>
          </div>
          <div>
            <dt>Usual</dt>
            <dd>{fmtMin(corridor.usualMin)}</dd>
          </div>
        </dl>
        <p className="meta">{meta}</p>
      </section>

      <div className="actions">
        {wait ? whereToWait : share}
        {wait ? share : whereToWait}
        {v.stale && !v.offline && (
          <button className="btn btn-quiet" onClick={async () => { if (!(await refresh())) toast('No newer update yet. Showing the saved copy.') }}>
            <RefreshCw size={18} aria-hidden="true" />Check for an update
          </button>
        )}
      </div>

      <ul className="rows">
        {wait && spot && (
          <li>
            <a className="row tone-ok" href="#/map">
              <MapPin className="row-icon" size={22} aria-hidden="true" />
              <span className="row-body">
                <span className="row-title">{spot.name} · {walkEstimate(spot.walkMin)}</span>
                <span className="meta">{spacesLeft(spot)} of {spot.capacity} spaces left{amenityList(spot) && ` · ${amenityList(spot)}`}</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" />
            </a>
          </li>
        )}
        <li>
          <div className="row">
            <WeatherIcon className="row-icon" size={22} aria-hidden="true" />
            <span className="row-body">
              <span className="row-title">{s.weather.label}, {s.weather.tempC}°C{s.weather.precipMm > 0 && ` · ${s.weather.precipMm} mm rain`}</span>
              <span className="meta">Open-Meteo · {s.weather.live && !v.offline ? `live, ${ago(s.weather.fetchedAt, now)}` : `saved ${clock(s.weather.fetchedAt)}`}</span>
            </span>
          </div>
        </li>
        <li>
          <a className={`row ${alerts.length ? 'tone-danger' : ''}`} href="#/alerts">
            <Bell className="row-icon" size={22} aria-hidden="true" />
            <span className="row-body">
              <span className="row-title">{alerts.length ? `${alerts.length} active ${alerts.length === 1 ? 'alert' : 'alerts'}` : 'No active alerts'}</span>
              {alerts[0] && <span className="meta">{alerts[0].title}</span>}
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </a>
        </li>
      </ul>
    </div>
  )
}
