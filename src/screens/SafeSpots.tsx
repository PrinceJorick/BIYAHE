import { Ban, CircleCheck, Clock, Droplet, ExternalLink, TriangleAlert, Utensils, Zap } from 'lucide-react'
import Badge from '../components/Badge'
import CorridorMap from '../components/CorridorMap'
import type { Amenity } from '../data'
import { amenityLabel, spacesLeft, studentView } from '../lib/derive'
import { googleMapsDirectionsUrl, walkEstimate } from '../lib/mapView'
import { useMedia } from '../lib/router'
import { selectSpot, useApp, useNow } from '../lib/store'

const amenityIcon: Record<Amenity, typeof Zap> = { power: Zap, water: Droplet, food: Utensils }

const Stroke = ({ dash }: { dash?: string }) => (
  <svg className="stroke" viewBox="0 0 30 6" aria-hidden="true"><path d="M2 3h26" stroke="currentColor" strokeWidth="4" strokeLinecap={dash === '1 7' ? 'round' : 'butt'} strokeDasharray={dash} /></svg>
)

export default function SafeSpots() {
  const s = useApp()
  const v = studentView(s, useNow())
  const wide = useMedia('(min-width: 900px)')
  const saved = v.provenance === 'saved'
  const { spot, cs, corridor } = v
  const tone = cs.status === 'closed' ? 'danger' : cs.status === 'slow' ? 'warn' : 'ok'
  const Icon = cs.status === 'closed' ? TriangleAlert : cs.status === 'slow' ? Clock : CircleCheck
  const headline = cs.status === 'closed'
    ? `${corridor.via} is closed. Wait on campus.`
    : cs.status === 'slow' ? `${corridor.via} is slow. You can wait here if you prefer.` : `${corridor.via} is open. Safe spots are here if you need them.`

  return (
    <div className="page">
      <div className="page-head">
        <div className="between">
          <h1 className="h1">Where to wait</h1>
          <Badge kind={saved ? 'saved' : 'official'} />
        </div>
        <p className={`status tone-${tone}`}><Icon size={20} aria-hidden="true" />{saved ? 'Last known: ' : ''}{headline}</p>
      </div>

      {!wide && <CorridorMap mode="student" extent="nearby" />}

      <ul className="legend" aria-label="Map legend">
        <li className="tone-ok"><Stroke /><CircleCheck size={16} aria-hidden="true" />Open</li>
        <li className="tone-warn"><Stroke dash="1 7" /><Clock size={16} aria-hidden="true" />Slow</li>
        <li className="tone-danger"><Stroke dash="7 5" /><TriangleAlert size={16} aria-hidden="true" />Closed</li>
      </ul>

      {spot ? (
        <div className="stack" style={{ gap: 6 }}>
          <a className="btn btn-primary btn-block" target="_blank" rel="noreferrer" href={googleMapsDirectionsUrl(spot.pos)}
            aria-label={`Directions to ${spot.name} in Google Maps (opens outside BIYAHE, needs internet)`}>
            <ExternalLink size={20} aria-hidden="true" />Directions in Google Maps (external, needs internet)
          </a>
          <p className="meta">{spot.name} is {walkEstimate(spot.walkMin)}. Google Maps chooses its own walking route; BIYAHE has not checked it.</p>
        </div>
      ) : (
        <p className="banner tone-danger"><TriangleAlert size={20} aria-hidden="true" /><span>Every safe spot is full. Stay inside the nearest building and check with a guard or marshal.</span></p>
      )}

      <ul className="rows" aria-label="Safe spots, nearest first">
        {[...s.snapshot.spots].sort((a, b) => a.walkMin - b.walkMin).map((x) => {
          const left = spacesLeft(x)
          const full = left <= 0
          const chosen = spot?.id === x.id
          return (
            <li key={x.id}>
              <button className={`row ${full ? 'tone-saved' : 'tone-ok'}`} aria-pressed={chosen} aria-disabled={full} onClick={() => !full && selectSpot(x.id)}>
                {full ? <Ban className="row-icon" size={22} aria-hidden="true" /> : <CircleCheck className="row-icon" size={22} aria-hidden="true" />}
                <span className="row-body">
                  <span className="row-title">{x.name}{chosen && <span className="tag tone-ok" style={{ marginLeft: 8 }}>· Selected</span>}</span>
                  <span className="meta">{walkEstimate(x.walkMin)} · {full ? 'Full' : `${left} of ${x.capacity} spaces left`}</span>
                  <span className="cluster meta" style={{ gap: 14 }}>
                    {(Object.keys(amenityLabel) as Amenity[]).filter((a) => x.amenities[a]).map((a) => {
                      const A = amenityIcon[a]
                      return <span key={a} className="tag" style={{ fontWeight: 500 }}><A size={15} aria-hidden="true" />{amenityLabel[a]}</span>
                    })}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
