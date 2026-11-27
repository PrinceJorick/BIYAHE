// Every map in the app. Google Maps when a key is configured, the device is online and Low-Battery Mode is off;
// otherwise the app's own simple map. Both draw the same MapModel (src/lib/mapModel.ts).
import { MapPinned } from 'lucide-react'
import { ACTIVE_CAMPUS } from '../../campuses/active'
import { alangilanRoadStatus } from '../../campuses/alangilan'
import { routeGeometry } from '../../campuses/routes'
import { CAMPUS, corridors } from '../../data'
import { GOOGLE_MAPS_KEY } from '../../lib/googleRoutes'
import { useGoogleMapsStatus } from '../../lib/googleMapsLoader'
import { buildMapModel, type MapFocus } from '../../lib/mapModel'
import { devRoadDataWarning } from '../../lib/mapView'
import { isLowBattery, isOffline, useApp } from '../../lib/store'
import DemoFloodToggle from '../DemoFloodToggle'
import DemoRoutes from '../DemoRoutes'
import MapFrame from '../MapFrame'
import GoogleMapView, { type Padding } from './GoogleMapView'
import SchematicMap from './SchematicMap'

const EDGE: Padding = { top: 48, right: 48, bottom: 40, left: 40 }

export type MapViewProps = {
  mode: 'student' | 'staff'
  label: string
  focus?: MapFocus
  showAll?: boolean
  /** Google's live traffic layer (Google map only). */
  traffic?: boolean
  /** Full-screen map (Map screen): greedy gestures, controls placed clear of the floating panels. */
  fill?: boolean
  /** Space kept clear for panels drawn over the map, in px. */
  padding?: Padding
  extent?: 'route' | 'nearby'
  onSpot?: (id: string) => void
}

export default function MapView({ mode, label, focus = null, showAll = false, traffic = false, fill = false, padding = EDGE, extent, onSpot }: MapViewProps) {
  const s = useApp()
  const gm = useGoogleMapsStatus()
  const offline = isOffline(s)
  const battery = isLowBattery(s)
  const why = !GOOGLE_MAPS_KEY ? 'nokey' : offline ? 'offline' : battery ? 'battery' : gm === 'error' ? 'error' : null
  const useGoogle = why === null
  // Without Google: OpenStreetMap streets under the app's lines, also offline (tiles saved for every campus while
  // online; closer zooms that were not saved show the stretched zoom-13 streets) and in Low-Battery Mode (no Google
  // map, no traffic layer, no animation; the tiles mostly come from the device's cache).
  const osm = why !== null
  const model = buildMapModel({
    mode, campus: CAMPUS, corridors, snapshot: s.snapshot, mineId: s.corridorId, focus, showAll, extent,
    googlePaths: useGoogle ? s.traffic?.routes ?? null : null, walk: s.walk,
  })
  const preview = routeGeometry[ACTIVE_CAMPUS.id].selection.previewRoutes
  const shownOsm = corridors.filter((c) => model.lines.some((l) => l.id === c.id && l.source === 'osm'))
  const notice = preview && shownOsm.length > 0 && <DemoRoutes routes={preview} shown={shownOsm} exitNote={routeGeometry[ACTIVE_CAMPUS.id].exitNote} />
  const warning = ACTIVE_CAMPUS.id === 'alangilan' && import.meta.env.DEV ? devRoadDataWarning(alangilanRoadStatus, true) : null
  const note = why && (
    <p className="map-note">
      <MapPinned size={14} aria-hidden="true" />
      {why === 'offline' ? 'Offline map' : why === 'battery' ? 'Low-Battery Mode map' : why === 'error' ? 'OpenStreetMap: Google map unavailable'
        : import.meta.env.DEV ? 'OpenStreetMap: add VITE_GOOGLE_MAPS_API_KEY for the Google map' : 'OpenStreetMap'}
    </p>
  )

  return (
    <MapFrame label={label} warning={warning} notice={notice} note={note} credit={!useGoogle && (model.osmCredit || osm)} fill={fill}
      demo={<DemoFloodToggle />}>
      {useGoogle
        ? <GoogleMapView model={model} fill={fill} padding={padding} traffic={traffic} onSpot={onSpot} />
        : <SchematicMap model={model} fill={fill} padding={padding} onSpot={onSpot} still={battery} tiles={osm} />}
    </MapFrame>
  )
}
