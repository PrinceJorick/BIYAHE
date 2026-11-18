import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { BatteryLow } from 'lucide-react'
import { ACTIVE_CAMPUS } from '../campuses/active'
import { alangilanRoadStatus } from '../campuses/alangilan'
import { routeGeometry } from '../campuses/routes'
import { CAMPUS, corridors, type CorridorStatus, type LatLng } from '../data'
import { isFull, spaceText, studentView } from '../lib/derive'
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

// Keeps Leaflet's idea of the container size in step with the layout: tab switches, the drawer/dialog opening,
// the desktop side pane appearing, rotation. Without it, tiles stay grey and markers drift after a resize.
function SizeSync() {
  const map = useMap()
  useEffect(() => {
    const el = map.getContainer()
    if (typeof ResizeObserver === 'undefined') return
    let frame = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [map])
  return null
}

// When the student picks a safe spot, bring it (and the walking route, once known) into view. Only explicit
// choices move the map; the default nearest spot leaves the overview fit alone.
function FocusSpot({ spotId, points, animate }: { spotId: string | null; points: LatLng[]; animate: boolean }) {
  const map = useMap()
  const key = spotId ? `${spotId}|${fitKey(points)}` : ''
  const last = useRef('')
  useEffect(() => {
    if (!key || key === last.current || points.length === 0) return
    last.current = key
    map.invalidateSize()
    map.fitBounds(L.latLngBounds(points), { animate, padding: [FIT_PADDING_PX * 2, FIT_PADDING_PX * 2], maxZoom: 18 })
  }, [map, key, points, animate])
  return null
}

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

// Student: own corridor and the campus safe spots. The chosen spot is highlighted and named; a walking route to
// it is drawn only when it is mapped geometry (live or saved from OpenStreetMap paths, src/lib/walkRoute.ts),
// never a straight line, which would look like a path someone checked. Staff: every corridor.
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
  const chosen = mode === 'student' ? v.spot : undefined
  const walk = mode === 'student' && s.walk && s.walk.spotId === chosen?.id && (s.walk.mode === 'live' || s.walk.mode === 'cached') ? s.walk : null
  const focus: LatLng[] = chosen ? [CAMPUS, chosen.pos, ...(walk?.path ?? [])] : []

  return (
    <MapFrame warning={warning} notice={notice} label={mode === 'staff' ? 'Route risk map. The same information is listed below.' : 'Map of your route and campus safe spots. The same information is listed in text.'}>
      <MapContainer key={plain ? 'plain' : 'tiles'} center={CAMPUS} zoom={15} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} attributionControl={false}
        scrollWheelZoom={!plain} zoomAnimation={!plain} fadeAnimation={!plain} markerZoomAnimation={!plain}>
        {!plain && <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={MAX_ZOOM} />}
        <SizeSync />
        <Fit points={points} />
        {mode === 'student' && <FocusSpot spotId={s.spotId} points={focus} animate={!plain} />}
        {shown.map((c) => {
          const st = s.snapshot.corridors[c.id].status
          return (
            <Polyline key={c.id + st} positions={c.path} className={`line-${st}`} pathOptions={{ weight: st === 'slow' ? 6 : 5, opacity: 1 }}>
              <Tooltip permanent direction="center" className={`map-label ${tone[st]}`}>{word[st]} · {c.via}</Tooltip>
            </Polyline>
          )
        })}
        {walk?.path && (
          <Polyline key={`walk-${walk.spotId}-${walk.mode}`} positions={walk.path} className={`line-footpath line-footpath-${walk.mode}`} pathOptions={{ weight: 4, opacity: 1 }} interactive={false} />
        )}
        {s.snapshot.spots.map((x) => {
          const full = isFull(x)
          const selected = chosen?.id === x.id
          const label = `${x.name}: ${spaceText(x)}${selected ? ' (selected)' : ''}`
          return (
            <Marker key={x.id + (selected ? '-on' : '')} position={x.pos} icon={spotIcon(full, selected)} title={label} alt={label} zIndexOffset={selected ? 500 : 0}
              eventHandlers={mode === 'student' && !full ? { click: () => selectSpot(x.id) } : undefined}>
              {selected && <Tooltip permanent direction="right" offset={[20, 0]} className="map-label map-spot-label">{x.name}</Tooltip>}
            </Marker>
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
