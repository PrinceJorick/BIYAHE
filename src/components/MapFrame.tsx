import type { ReactNode } from 'react'
import { OSM_ATTRIBUTION } from '../lib/mapView'

// Wraps every map. The OpenStreetMap credit is rendered here whenever the map draws OSM-derived geometry (the
// app's route lines and walking paths), whichever map is underneath: Google's (which credits its own data) or the
// app's simple map. It is static text and a link in the app bundle; nothing is loaded from the network.
// `warning` is a development-only notice (see devRoadDataWarning); production passes null.
// `notice` is the small "About routes" button; `note` says why the simple map is shown.
export default function MapFrame({ label, warning, notice, note, credit = true, fill = false, children }: {
  label: string; warning?: string | null; notice?: ReactNode; note?: ReactNode; credit?: boolean; fill?: boolean; children?: ReactNode
}) {
  return (
    <div className={`map${fill ? ' map-fill' : ''}`} role="group" aria-label={label}>
      {children}
      {warning && <p className="map-dev-warning" role="alert">{warning}</p>}
      {(notice || note || credit) && (
        <div className="map-meta">
          {note}
          {notice}
          {credit && (
            <p className="map-attribution">
              <a href={OSM_ATTRIBUTION.href} target="_blank" rel="noreferrer">{OSM_ATTRIBUTION.text}</a>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
