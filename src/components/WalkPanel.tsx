import { Database, ExternalLink, Footprints, LoaderCircle, Ruler, TriangleAlert } from 'lucide-react'
import { WALK_M_PER_MIN } from '../lib/coords'
import { clock } from '../lib/derive'
import { googleMapsDirectionsUrl } from '../lib/mapView'
import { walkSummary, type WalkRoute } from '../lib/walkRoute'
import type { Spot } from '../types'

// How the walking figure was worked out. Each mode differs in icon, label and outline, not colour.
const walkBadge: Record<WalkRoute['mode'], { Icon: typeof Ruler; label: string; cls: string }> = {
  live: { Icon: Footprints, label: 'Mapped route', cls: 'badge-live' },
  cached: { Icon: Database, label: 'Saved route', cls: 'badge-saved' },
  estimate: { Icon: Ruler, label: 'Estimate', cls: 'badge-estimate' },
  unavailable: { Icon: TriangleAlert, label: 'Unavailable', cls: 'badge-saved' },
}

/** Walking directions from the campus point to a safe spot, with an honest label for their source. */
export default function WalkPanel({ spot, route, loading, headingLevel = 2 }: { spot: Spot; route: WalkRoute | null; loading: boolean; headingLevel?: 2 | 3 }) {
  const b = route && walkBadge[route.mode]
  const H = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <section className="card" aria-labelledby={`walk-${spot.id}`} aria-busy={loading}>
      <div className="card-head">
        <H id={`walk-${spot.id}`} className="h2">Getting there</H>
        {b && !loading && <span className={`badge ${b.cls}`}><b.Icon size={14} aria-hidden="true" /><span className="sr-only">Route source: </span>{b.label}</span>}
      </div>
      <p className="walk-figure" role="status">
        {loading || !route ? <><LoaderCircle className="spin" size={18} aria-hidden="true" />Finding a walking route…</> : walkSummary(route)}
      </p>
      {route && !loading && (
        <p className="meta">
          {route.mode === 'live' && 'From the campus point along OpenStreetMap paths, shown on the map. Not checked on site: follow marshals and avoid flooded or closed paths.'}
          {route.mode === 'cached' && `Saved on this phone at ${clock(route.fetchedAt!)} from OpenStreetMap paths. Not checked on site.`}
          {route.mode === 'estimate' && `No mapped walking route${route.reason ? ` (${route.reason})` : ''}. Straight-line distance at ${WALK_M_PER_MIN} m per minute; the real walk is longer, and no line is drawn.`}
          {route.mode === 'unavailable' && 'This safe spot has no usable position. Ask a guard or marshal for directions.'}
        </p>
      )}
      <a className="btn btn-secondary btn-block" target="_blank" rel="noreferrer" href={googleMapsDirectionsUrl(spot.pos)}
        aria-label={`Walking directions to ${spot.name} in Google Maps (opens outside BIYAHE, needs internet)`}>
        <ExternalLink size={18} aria-hidden="true" />Walking directions in Google Maps
      </a>
      <p className="caption">Opens Google Maps (needs internet). Google chooses its own route; BIYAHE has not checked it.</p>
    </section>
  )
}
