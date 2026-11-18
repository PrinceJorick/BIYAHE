import { Ban, CircleCheck, Clock, Database, Droplet, ExternalLink, Footprints, LoaderCircle, Ruler, TriangleAlert, Utensils, Zap } from 'lucide-react'
import { useEffect } from 'react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import Badge from '../components/Badge'
import CorridorMap from '../components/CorridorMap'
import type { Amenity } from '../data'
import { amenityLabel, isFull, spaceText, studentView } from '../lib/derive'
import { clock } from '../lib/derive'
import { WALK_M_PER_MIN } from '../lib/coords'
import { googleMapsDirectionsUrl, walkEstimate } from '../lib/mapView'
import { walkSummary, type WalkRoute } from '../lib/walkRoute'
import { useMedia } from '../lib/router'
import { isLowBattery, isOffline, loadWalkRoute, selectSpot, useApp, useNow } from '../lib/store'

const amenityIcon: Record<Amenity, typeof Zap> = { power: Zap, water: Droplet, food: Utensils }

const Stroke = ({ dash }: { dash?: string }) => (
  <svg className="stroke" viewBox="0 0 30 6" aria-hidden="true"><path d="M2 3h26" stroke="currentColor" strokeWidth="4" strokeLinecap={dash === '1 7' ? 'round' : 'butt'} strokeDasharray={dash} /></svg>
)

// How the walking figure was worked out. Each mode differs in icon, label and outline, not only colour.
const walkBadge: Record<WalkRoute['mode'], { Icon: typeof Zap; label: string; cls: string }> = {
  live: { Icon: Footprints, label: 'Mapped route', cls: 'badge-live' },
  cached: { Icon: Database, label: 'Saved route', cls: 'badge-saved' },
  estimate: { Icon: Ruler, label: 'Estimate', cls: 'badge-estimate' },
  unavailable: { Icon: TriangleAlert, label: 'Unavailable', cls: 'badge-saved' },
}

function WalkPanel({ name, route, loading }: { name: string; route: WalkRoute | null; loading: boolean }) {
  const b = route && walkBadge[route.mode]
  return (
    <section className="walk" aria-labelledby="walk-title" aria-busy={loading}>
      <div className="between">
        <h2 id="walk-title" className="h2">Walking route</h2>
        {b && !loading && <span className={`badge ${b.cls}`}><b.Icon size={15} aria-hidden="true" /><span className="sr-only">Route source: </span>{b.label}</span>}
      </div>
      <p className="meta">To <span className="strong" style={{ color: 'var(--ink)' }}>{name}</span> from the campus point</p>
      <p className="walk-figure" role="status">
        {loading || !route
          ? <><LoaderCircle className="spin" size={18} aria-hidden="true" />Finding a walking route…</>
          : walkSummary(route)}
      </p>
      {route && !loading && (
        <p className="meta">
          {route.mode === 'live' && 'From OpenStreetMap paths, shown on the map. Not checked on site: follow marshals and avoid flooded or closed paths.'}
          {route.mode === 'cached' && `Saved on this phone at ${clock(route.fetchedAt!)} from OpenStreetMap paths. Not checked on site.`}
          {route.mode === 'estimate' && `No mapped walking route${route.reason ? ` (${route.reason})` : ''}. Straight-line distance at ${WALK_M_PER_MIN} m per minute; the real walk is longer, and no line is drawn.`}
          {route.mode === 'unavailable' && 'This safe spot has no usable position. Ask a guard or marshal for directions.'}
        </p>
      )}
    </section>
  )
}

export default function SafeSpots() {
  const s = useApp()
  const v = studentView(s, useNow())
  const wide = useMedia('(min-width: 900px)')
  const saved = v.provenance === 'saved'
  const { spot, cs, corridor } = v
  // Look up the walking route whenever the spot on screen changes, or the network / battery situation does.
  // Primitive dependencies: snapshot updates (occupancy +10) create new spot objects but must not refetch.
  const net = !isOffline(s) && !isLowBattery(s)
  const [spotId, lat, lng] = [spot?.id, spot?.pos[0], spot?.pos[1]]
  useEffect(() => {
    void loadWalkRoute(spotId && lat != null && lng != null ? { id: spotId, pos: [lat, lng] } : undefined)
  }, [spotId, lat, lng, net])
  const tone = cs.status === 'closed' ? 'danger' : cs.status === 'slow' ? 'warn' : 'ok'
  const Icon = cs.status === 'closed' ? TriangleAlert : cs.status === 'slow' ? Clock : CircleCheck
  const headline = cs.status === 'closed'
    ? `${corridor.via} is closed. Wait on campus.`
    : cs.status === 'slow' ? `${corridor.via} is slow. You can wait here if you prefer.` : `${corridor.via} is open. Safe spots are here if you need them.`

  return (
    <div className="page">
      <div className="page-head">
        <div className="between">
          <h1 className="h1">Where to wait<span className="sr-only"> at {ACTIVE_CAMPUS.shortName}</span></h1>
          <Badge kind={saved ? 'saved' : 'official'} />
        </div>
        <p className={`status tone-${tone}`}><Icon size={20} aria-hidden="true" />{saved ? 'Last known: ' : ''}{headline}</p>
      </div>

      {!wide && <CorridorMap mode="student" extent="nearby" />}

      <p className="meta campus-line">{ACTIVE_CAMPUS.shortName} · {s.snapshot.spots.length} safe {s.snapshot.spots.length === 1 ? 'spot' : 'spots'}</p>

      <ul className="legend" aria-label="Map legend">
        <li className="tone-ok"><Stroke /><CircleCheck size={16} aria-hidden="true" />Open</li>
        <li className="tone-warn"><Stroke dash="1 7" /><Clock size={16} aria-hidden="true" />Slow</li>
        <li className="tone-danger"><Stroke dash="7 5" /><TriangleAlert size={16} aria-hidden="true" />Closed</li>
        <li className="tone-walk"><Stroke /><Footprints size={16} aria-hidden="true" />Walking route</li>
      </ul>

      {spot ? (
        <div className="stack" style={{ gap: 12 }}>
          <WalkPanel name={spot.name} route={s.walk?.spotId === spot.id ? s.walk : null} loading={s.walkLoading === spot.id} />
          <a className="btn btn-primary btn-block" target="_blank" rel="noreferrer" href={googleMapsDirectionsUrl(spot.pos)}
            aria-label={`Directions to ${spot.name} in Google Maps (opens outside BIYAHE, needs internet)`}>
            <ExternalLink size={20} aria-hidden="true" />Directions in Google Maps (external, needs internet)
          </a>
          <p className="meta">Google Maps chooses its own walking route; BIYAHE has not checked it.</p>
        </div>
      ) : (
        <p className="banner tone-danger"><TriangleAlert size={20} aria-hidden="true" /><span>Every safe spot is full. Stay inside the nearest building and check with a guard or marshal.</span></p>
      )}

      <ul className="rows" aria-label="Safe spots, nearest first">
        {[...s.snapshot.spots].sort((a, b) => a.walkMin - b.walkMin).map((x) => {
          const full = isFull(x)
          const chosen = spot?.id === x.id
          return (
            <li key={x.id}>
              <button className={`row ${full ? 'tone-saved' : 'tone-ok'}`} aria-pressed={chosen} aria-disabled={full} onClick={() => !full && selectSpot(x.id)}>
                {full ? <Ban className="row-icon" size={22} aria-hidden="true" /> : <CircleCheck className="row-icon" size={22} aria-hidden="true" />}
                <span className="row-body">
                  <span className="row-title">{x.name}{chosen && <span className="tag tone-ok" style={{ marginLeft: 8 }}>· Selected</span>}</span>
                  <span className="meta">{walkEstimate(x.walkMin)} · {spaceText(x)}</span>
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
