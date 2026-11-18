import type { ReactNode } from 'react'
import { OSM_ATTRIBUTION } from '../lib/mapView'

// Wraps every map. The OpenStreetMap credit is rendered here rather than by Leaflet's attribution control,
// so it stays visible in every mode: with street tiles, in Low-Battery Mode (no tiles) and offline. It is
// static text and a link in the app bundle; nothing is loaded from the network.
// `warning` is a development-only notice (see devRoadDataWarning); production passes null.
// `notice` is the small prototype-preview indicator ("Demo routes"), shown whenever preview geometry is drawn.
export default function MapFrame({ label, warning, notice, children }: { label: string; warning?: string | null; notice?: ReactNode; children?: ReactNode }) {
  return (
    <div className="map" role="group" aria-label={label}>
      {children}
      {warning && <p className="map-dev-warning" role="alert">{warning}</p>}
      {notice}
      <p className="map-attribution">
        <a href={OSM_ATTRIBUTION.href} target="_blank" rel="noreferrer">{OSM_ATTRIBUTION.text}</a>
      </p>
    </div>
  )
}
