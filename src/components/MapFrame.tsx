import type { ReactNode } from 'react'
import { OSM_ATTRIBUTION } from '../lib/mapView'

// Wraps every map. The OpenStreetMap credit is shown on the app's own map (OSM tiles or OSM-derived route lines).
// Over Google's map it is left off the map (Google credits its own data) and given in the "About routes" dialog
// for the OSM-derived route lines. It is static text and a link in the app bundle; nothing is loaded from the network.
// `warning` is a development-only notice (see devRoadDataWarning); production passes null.
// `notice` is the small "About routes" button; `note` says why the simple map is shown. On the full-screen map these
// sit quietly at the top-right (an info icon and the short credit) so the place chip stands alone.
// `demo` is the demo-only Clear / Flooding switch, kept in its own corner so it never mixes with real map notes.
export default function MapFrame({ label, warning, notice, note, demo, credit = true, fill = false, children }: {
  label: string; warning?: string | null; notice?: ReactNode; note?: ReactNode; demo?: ReactNode; credit?: boolean; fill?: boolean; children?: ReactNode
}) {
  return (
    <div className={`map${fill ? ' map-fill' : ''}`} role="group" aria-label={label}>
      {children}
      {warning && <p className="map-dev-warning" role="alert">{warning}</p>}
      {demo}
      {(notice || note || credit) && (
        <div className="map-meta">
          {note}
          {notice}
          {credit && (
            <p className="map-attribution">
              <a href={OSM_ATTRIBUTION.href} target="_blank" rel="noreferrer">{fill ? '© OpenStreetMap' : OSM_ATTRIBUTION.text}</a>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
