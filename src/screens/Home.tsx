// Home (wireframe 1): weather and date, traffic flow, "Where do you want to go?" with three options, and every
// place the student can go. Choosing an option or a place opens its details (#/go/<kind>/<id>).
import { ChevronRight, Cloud, CloudFog, CloudLightning, CloudOff, CloudRain, Lightbulb, Megaphone, Moon, ShieldAlert, Sparkles, Sun, type LucideIcon } from 'lucide-react'
import { createElement, useState } from 'react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import Badge from '../components/Badge'
import Lvl from '../components/Lvl'
import NewsArticleRow, { NewsCredit } from '../components/NewsArticleRow'
import { PlaceIcon, PlaceRow, TrafficSource, TrafficWord } from '../components/places'
import { corridors } from '../data'
import { studentAdvisories } from '../lib/advisories'
import { ago, clock, fmtMin, fmtRange, studentView } from '../lib/derive'
import { fetchExplanation } from '../lib/explain'
import { placeArg, placeShort, recommend, recommendationReason, routePlaces, spotPlaces, walkText, type Reason, type RoutePlace } from '../lib/places'
import { hrefOf } from '../lib/router'
import { isOffline, useApp, useNow, type State } from '../lib/store'
import { levelOfTraffic, rainLevel } from '../lib/traffic'
import { currentAlerts, skyOf, type Sky } from '../lib/weather'
import { visibleNews } from './useTrip'

const skyIcons: Record<Sky, LucideIcon> = { clear: Sun, cloud: Cloud, fog: CloudFog, rain: CloudRain, storm: CloudLightning }

function SkyIcon({ code, precip, day }: { code: number | undefined; precip: number; day: boolean }) {
  const sky = skyOf(code, precip)
  const props = { className: 'wx-icon', size: 44, strokeWidth: 1.6, 'aria-hidden': true } as const
  return sky === 'clear' && !day ? <Moon {...props} /> : createElement(skyIcons[sky], props)
}

const dateFmt = new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Manila' })
const hourFmt = (t: number) => new Date(t).toLocaleTimeString('en-PH', { hour: 'numeric', timeZone: 'Asia/Manila' })

function WeatherCard({ s, now, offline }: { s: State; now: number; offline: boolean }) {
  const w = s.weather
  const warnings = currentAlerts(w?.alerts, now)
  const head = (
    <div className="card-head">
      <p className="eyebrow" id="wx-date">{dateFmt.format(now)}</p>
      <p className="meta"><time>{clock(now)}</time></p>
    </div>
  )
  if (!w) {
    return (
      <section className="card card-weather" aria-labelledby="wx-date">
        {head}
        <div className="wx-now">
          <CloudOff className="wx-icon" size={44} strokeWidth={1.6} aria-hidden="true" />
          <div className="wx-desc">
            <p className="h3">Weather unavailable</p>
            <p className="meta">{offline ? 'Weather needs a connection. It is not stored on this device.' : s.weatherError ? 'Google Weather could not be reached. BIYAHE will try again.' : 'Loading the weather…'}</p>
          </div>
        </div>
      </section>
    )
  }
  const hours = (w.hourly ?? []).filter((h) => h.t + 3_600_000 > now).slice(0, 5)
  const live = w.live && !offline
  return (
    <section className="card card-weather" aria-labelledby="wx-date">
      {head}
      <div className="wx-now">
        <SkyIcon code={w.code} precip={w.precipMm} day={w.isDay ?? true} />
        <p className="wx-temp num">{w.tempC}°<span className="sr-only">C</span></p>
        <div className="wx-desc">
          <p className="h3">{w.label}</p>
          <p className="meta">
            {w.rainPct != null ? `${w.rainPct}% chance of rain` : w.precipMm > 0 ? `${w.precipMm} mm rain` : 'No rain now'} · wind {w.windKph} km/h
            {w.thunderPct != null && w.thunderPct >= 30 ? ` · ${w.thunderPct}% thunderstorm chance` : ''}
          </p>
        </div>
      </div>
      {hours.length > 0 && (
        <div className="wx-hours-wrap">
          <p className="caption" id="wx-hours">Chance of rain</p>
          <ol className="wx-hours" aria-labelledby="wx-hours">
            {hours.map((h) => (
              <li key={h.t}>
                <span className="meta">{h.t <= now ? 'Now' : hourFmt(h.t)}</span>
                <Lvl level={rainLevel(h.rainPct)} className="strong">{h.rainPct == null ? '–' : `${h.rainPct}%`}</Lvl>
              </li>
            ))}
          </ol>
        </div>
      )}
      {warnings.length > 0 && (
        <a className="item" href="#/alerts?filter=pagasa">
          <span className="item-icon"><ShieldAlert size={20} aria-hidden="true" /></span>
          <span className="item-body">
            <span className="caption">{warnings[0].authority} · official warning</span>
            <span className="item-title">{warnings[0].title}{warnings.length > 1 ? ` and ${warnings.length - 1} more` : ''}</span>
          </span>
          <ChevronRight className="item-chev" size={18} aria-hidden="true" />
        </a>
      )}
      <p className="caption cluster">
        <Badge kind={live ? 'estimate' : 'saved'} />
        {w.source === 'demo' ? 'Simulated weather' : 'Google Weather'} · {live ? `updated ${ago(w.fetchedAt, now)}` : `last reading ${clock(w.observedAt ?? w.fetchedAt)}`}
        {w.alerts === undefined && live ? ' · weather warnings could not be checked' : ''}
      </p>
    </section>
  )
}

function WhyCard({ reason, offline }: { reason: Reason; offline: boolean }) {
  const [ai, setAi] = useState<{ text: string } | { error: string } | 'loading' | null>(null)
  const ask = () => {
    setAi('loading')
    fetchExplanation(reason).then((text) => setAi({ text }), (e: Error) => setAi({ error: e.message || 'AI explanation unavailable' }))
  }
  return (
    <section className="card" aria-labelledby="why">
      <div className="card-head">
        <h2 className="h3 cluster" id="why"><Lightbulb size={18} aria-hidden="true" />Why this suggestion</h2>
        <Badge kind="estimate" />
      </div>
      <p className="body">{reason.rule}</p>
      <ul className="meta bullets">{reason.facts.map((f) => <li key={f}>{f}</li>)}</ul>
      <div aria-live="polite">
        {ai && ai !== 'loading' && 'text' in ai && (
          <p className="body"><Sparkles size={16} aria-hidden="true" /> {ai.text} <span className="caption">(AI-written summary of the facts above · Gemini)</span></p>
        )}
        {ai && ai !== 'loading' && 'error' in ai && <p className="caption">{ai.error}. The facts above are what BIYAHE used.</p>}
      </div>
      {!offline && ai === null && <button type="button" className="btn btn-quiet btn-sm" onClick={ask}><Sparkles size={16} aria-hidden="true" />Explain in plain words</button>}
      {ai === 'loading' && <p className="caption" role="status">Asking Gemini…</p>}
    </section>
  )
}

function TrafficCard({ mine, others, saved }: { mine: RoutePlace; others: RoutePlace[]; saved: boolean }) {
  const t = mine.traffic
  // Other routes in one line, by level ("2 light · 1 closed"); each route has its own row under Available places.
  const counts = (['light', 'moderate', 'heavy', 'closed'] as const).map((l) => [l, others.filter((r) => r.traffic.level === l).length] as const).filter(([, n]) => n > 0)
  return (
    <section className="card card-traffic" aria-labelledby="traffic-title">
      <div className="card-head">
        <p className="eyebrow" id="traffic-title">Traffic flow</p>
        <TrafficSource t={t} saved={saved} />
      </div>
      <p className="h1"><TrafficWord t={t} suffix=" traffic" /></p>
      <p className="meta">
        {t.level === 'closed' ? `${mine.corridor.via} to ${mine.corridor.name} is closed.` : `To ${mine.corridor.name} via ${mine.corridor.via}: ${fmtRange(t.minLo, t.minHi)} now, usually ${fmtMin(mine.corridor.usualMin)}.`}
      </p>
      {counts.length > 0 && (
        <p className="meta traffic-others">
          Other routes:{' '}
          {counts.map(([l, n], i) => (
            <span key={l}>{i > 0 && ' · '}<Lvl level={levelOfTraffic[l]} className="strong">{n} {l}</Lvl></span>
          ))}
        </p>
      )}
      <a className="card-foot-link" href={hrefOf('go', placeArg(mine))}>Trip details<ChevronRight size={16} aria-hidden="true" /></a>
    </section>
  )
}

export default function Home() {
  const s = useApp()
  const now = useNow(30_000)
  const v = studentView(s, now)
  const routes = routePlaces(s.snapshot, corridors, s.traffic?.routes ?? null, s.corridorId, now)
  const spots = spotPlaces(s.snapshot.spots)
  const options = recommend(routes, spots)
  const mine = routes.find((r) => r.mine) ?? routes[0]
  const alerts = studentAdvisories(s.snapshot.advisories, s.corridorId, now)
  const urgent = alerts.find((a) => a.severity === 'critical') ?? alerts.find((a) => a.scope === s.corridorId)
  const saved = v.provenance === 'saved'
  const peak = Math.max(-1, ...(s.weather?.hourly ?? []).filter((h) => h.t + 3_600_000 > now && h.t < now + 6 * 3_600_000).map((h) => h.rainPct ?? -1))
  const reason = recommendationReason(options, { rainPeakPct: peak >= 0 ? peak : null, warnings: currentAlerts(s.weather?.alerts, now).length })
  const top = visibleNews(s, now)[0]

  return (
    <div className="page home">
      <div className="home-head">
        <h1 className="sr-only">Home</h1>
        <p className="meta"><span className="strong">{ACTIVE_CAMPUS.shortName}</span> · route home: {mine.corridor.name} · <a href="#/setup">Change</a></p>
      </div>

      {urgent && (
        <a className="card card-link alert-strip" href="#/alerts">
          <Megaphone size={20} aria-hidden="true" />
          <span className="alert-strip-body">
            <span className="meta"><Lvl level={urgent.severity === 'critical' ? 'high' : 'mid'} className="strong">{urgent.severity === 'critical' ? 'Critical' : 'Warning'}</Lvl> · {urgent.issuer}</span>
            <span className="item-title">{urgent.title}</span>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </a>
      )}

      <WeatherCard s={s} now={now} offline={v.offline} />
      {top && (
        <section className="card" aria-labelledby="today-news">
          <h2 className="h3" id="today-news">Today near your route</h2>
          <ul className="list">
            <li><NewsArticleRow item={top} now={now} offline={isOffline(s)} savedAt={s.news?.fetchedAt ?? now} /></li>
          </ul>
          <a className="card-foot-link" href="#/alerts?filter=news">More local news<ChevronRight size={16} aria-hidden="true" /></a>
          <NewsCredit />
        </section>
      )}
      <TrafficCard mine={mine} others={routes.filter((r) => !r.mine)} saved={saved} />

      <section className="card card-options" aria-labelledby="where">
        <div>
          <h2 className="h2" id="where">Where do you want to go?</h2>
          <p className="meta">Suggested for conditions right now</p>
        </div>
        <ul className="options">
          {options.map((o) => (
            <li key={placeArg(o.place)}>
              <a className={`option${o.recommended ? ' option-best' : ''}`} href={hrefOf('go', placeArg(o.place))}>
                <span className="option-top">
                  <span className="option-icon"><PlaceIcon place={o.place} /></span>
                  {o.recommended && <span className="option-flag">Best now</span>}
                </span>
                <span className="caption">{o.verb}</span>
                <span className="option-title">{placeShort(o.place)}</span>
                <span className="meta option-meta">
                  {o.place.kind === 'route'
                    ? <>{o.place.traffic.level === 'closed' ? '' : `${fmtRange(o.place.traffic.minLo, o.place.traffic.minHi)} · `}<Lvl level={levelOfTraffic[o.place.traffic.level]}>{o.place.traffic.level === 'closed' ? 'Closed' : o.place.cs.status === 'slow' ? 'Slow' : 'Open'}</Lvl></>
                    : walkText(o.place.spot.walkMin)}
                </span>
                {o.verb === 'Suggested alternative' && <span className="caption">Not verified safe</span>}
              </a>
            </li>
          ))}
        </ul>
      </section>

      {reason && <WhyCard reason={reason} offline={v.offline} />}

      <section className="card" aria-labelledby="places-routes">
        <h2 className="h2" id="places-routes">Routes home</h2>
        <ul className="list">{routes.map((r) => <li key={r.id}><PlaceRow place={r} /></li>)}</ul>
      </section>

      <section className="card" aria-labelledby="places-spots">
        <h2 className="h2" id="places-spots">Safe spots on campus</h2>
        <ul className="list">{spots.map((p) => <li key={p.id}><PlaceRow place={p} /></li>)}</ul>
      </section>
    </div>
  )
}
