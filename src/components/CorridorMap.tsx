import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { BatteryLow } from 'lucide-react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import { alangilanRoadStatus } from '../campuses/alangilan'
import { routeGeometry } from '../campuses/routes'
import { CAMPUS, corridors, type CorridorStatus, type LatLng } from '../data'
import { spacesLeft, studentView } from '../lib/derive'
import {
  devRoadDataWarning, FIT_MAX_ZOOM, FIT_PADDING_PX, fitKey, mapFitPoints, MAX_ZOOM, MIN_ZOOM, type MapExtent,
} from '../lib/mapView'
import DemoRoutes from './DemoRoutes'
import MapFrame from './MapFrame'
import { isLowBattery, selectSpot, useApp, useNow } from '../lib/store'

const glyph = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
}
const svg = (d: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`

const spotIcon = (full: boolean, selected: boolean) =>
  L.divIcon({
    className: '',
    html: `<span class="pin ${full ? 'tone-saved' : 'tone-ok'} ${selected ? 'pin-selected' : ''}">${svg(full ? glyph.ban : glyph.check)}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
const youIcon = L.divIcon({ className: '', html: '<span class="pin pin-you"></span>', iconSize: [22, 22], iconAnchor: [11, 11] })

const tone: Record<CorridorStatus, string> = { open: 'tone-ok', slow: 'tone-warn', closed: 'tone-danger' }
const word: Record<CorridorStatus, string> = { open: 'Open', slow: 'Slow', closed: 'Closed' }

function Fit({ points }: { points: LatLng[] }) {
  const map = useMap()
  const key = fitKey(points)
  // Refit only when the map or the point list actually changes, as before; `points` is a new
  // array every render, so the last fitted map + key are remembered.
  const fitted = useRef<{ map: L.Map; key: string } | null>(null)
  useEffect(() => {
    if (fitted.current?.map === map && fitted.current.key === key) return
    fitted.current = { map, key }
    map.invalidateSize()
    // Fit the displayed features themselves, with a fixed pixel margin and a zoom cap.
    map.fitBounds(L.latLngBounds(points), { animate: false, padding: [FIT_PADDING_PX, FIT_PADDING_PX], maxZoom: FIT_MAX_ZOOM })
  }, [map, key, points])
  return null
}

// Student: own corridor and the campus safe spots (the chosen spot is highlighted; no line is drawn to it,
// because a straight line would look like a walking route). Staff: every corridor.
// Line pattern carries status without colour: solid = open, dotted = slow, dashed = closed.
// `extent` (student only): 'route' fits the whole route (side pane); 'nearby' fits campus, safe spots and
// the first kilometre of the route (the narrow "Where to wait" map).
export default function CorridorMap({ mode, extent = 'route' }: { mode: 'student' | 'staff'; extent?: MapExtent }) {
  const s = useApp()
  const v = studentView(s, useNow())
  const plain = isLowBattery(s)
  const shown = mode === 'staff' ? corridors : [v.corridor]
  const points = mapFitPoints(mode, extent, { campus: CAMPUS, corridors, corridor: v.corridor, spots: s.snapshot.spots })
  const warning = ACTIVE_CAMPUS.id === 'alangilan' && import.meta.env.DEV ? devRoadDataWarning(alangilanRoadStatus, true) : null
  const routes = routeGeometry[ACTIVE_CAMPUS.id]
  const preview = routes.selection.previewRoutes
  // Shown whenever road-following routes are drawn: where they come from and their known limitations.
  const notice = preview && <DemoRoutes routes={preview} shown={shown} exitNote={routes.exitNote} />

  return (
    <MapFrame warning={warning} notice={notice} label={mode === 'staff' ? 'Route risk map. The same information is listed below.' : 'Map of your route and campus safe spots. The same information is listed in text.'}>
      <MapContainer key={plain ? 'plain' : 'tiles'} center={CAMPUS} zoom={15} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} attributionControl={false}
        scrollWheelZoom={!plain} zoomAnimation={!plain} fadeAnimation={!plain} markerZoomAnimation={!plain}>
        {!plain && <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={MAX_ZOOM} />}
        <Fit points={points} />
        {shown.map((c) => {
          const st = s.snapshot.corridors[c.id].status
          return (
            <Polyline key={c.id + st} positions={c.path} className={`line-${st}`} pathOptions={{ weight: st === 'slow' ? 6 : 5, opacity: 1 }}>
              <Tooltip permanent direction="center" className={`map-label ${tone[st]}`}>{word[st]} · {c.via}</Tooltip>
            </Polyline>
          )
        })}
        {s.snapshot.spots.map((x) => {
          const full = spacesLeft(x) <= 0
          const label = `${x.name}: ${full ? 'full' : `${spacesLeft(x)} spaces left`}`
          return (
            <Marker key={x.id} position={x.pos} icon={spotIcon(full, mode === 'student' && v.spot?.id === x.id)} title={label} alt={label}
              eventHandlers={mode === 'student' && !full ? { click: () => selectSpot(x.id) } : undefined} />
          )
        })}
        <Marker position={CAMPUS} icon={youIcon} title={ACTIVE_CAMPUS.shortName} alt={ACTIVE_CAMPUS.shortName} keyboard={false} />
      </MapContainer>
      {plain && (
        <p className="map-plain"><BatteryLow size={18} aria-hidden="true" />Simple map. Street tiles are off to save battery.</p>
      )}
    </MapFrame>
  )
}
