// The app's own simple map: route lines, safe spots and the campus on the brand dot grid, with no street tiles.
// Used whenever Google Maps is not available (no key, offline, Low-Battery Mode, key rejected). Everything it
// draws ships in the app, so it works with no network at all.
import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { MapContainer, Marker, Polyline, Tooltip, useMap, ZoomControl } from 'react-leaflet'
import { statusLevel, statusWord, type MapLine, type MapModel } from '../../lib/mapModel'
import { FIT_MAX_ZOOM, fitKey, MAX_ZOOM, MIN_ZOOM } from '../../lib/mapView'
import type { LatLng } from '../../types'
import { GO_PIN } from '../logoGeometry'
import { declutter } from './declutter'
import type { Padding } from './GoogleMapView'

const icon = (d: string) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
const CHECK = '<path d="M20 6 9 17l-5-5"/>'
const BAN = '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>'
const FLAG = '<path d="M4 22V4"/><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1"/>'

// Icons are cached by content: a new icon object makes Leaflet replace the marker's DOM element on every render
// (the coordinator re-renders every few seconds), which would also undo the label declutter.
const icons = new Map<string, L.DivIcon>()
const cached = (key: string, make: () => L.DivIcon) => icons.get(key) ?? (icons.set(key, make()), icons.get(key)!)

const spotIcon = (full: boolean, selected: boolean) => cached(`spot|${full}|${selected}`, () => L.divIcon({
  className: '',
  html: `<span class="pin${selected ? ' pin-selected' : ''}${full ? ' pin-full' : ''}">${icon(full ? BAN : CHECK)}</span>`,
  iconSize: [34, 34], iconAnchor: [17, 17],
}))
const escape = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
// A route's status label, centred on its label point (the icon box is zero-sized at the point; CSS centres the tag).
const tagIcon = (status: MapLine['status'], via: string, focus: boolean) => cached(`tag|${status}|${via}|${focus}`, () => L.divIcon({
  className: 'map-tag-icon', iconSize: [0, 0], iconAnchor: [0, 0],
  html: `<span class="map-tag${focus ? ' map-tag-focus' : ''}"><b class="lvl lvl-${statusLevel[status]}">${statusWord[status]}</b> · ${escape(via)}</span>`,
}))
const endIcon = L.divIcon({ className: '', html: `<span class="pin pin-end">${icon(FLAG)}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] })
const campusIcon = L.divIcon({
  className: '',
  html: `<span class="map-campus"><svg width="26" height="30" viewBox="${GO_PIN.markViewBox}" aria-hidden="true"><path d="${GO_PIN.pin}" fill="#0B2D5B"/><path d="${GO_PIN.arrow}" fill="none" stroke="#F8FAFC" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`,
  iconSize: [26, 30], iconAnchor: [13, 30],
})

// Keeps Leaflet's idea of the container size in step with the layout (panels opening, rotation, the desktop rail).
function SizeSync() {
  const map = useMap()
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    let frame = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }))
    })
    ro.observe(map.getContainer())
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [map])
  return null
}

// Hides labels that would cover a pin or a more important label, after every change of view.
function Declutter({ version }: { version: string }) {
  const map = useMap()
  useEffect(() => {
    const run = () => requestAnimationFrame(() => declutter(map.getContainer()))
    run()
    map.on('zoomend moveend resize', run)
    return () => {
      map.off('zoomend moveend resize', run)
    }
  }, [map, version])
  return null
}

function Fit({ points, padding }: { points: LatLng[]; padding: Padding }) {
  const map = useMap()
  const key = `${fitKey(points)}|${padding.top},${padding.right},${padding.bottom},${padding.left}`
  const last = useRef('')
  useEffect(() => {
    if (key === last.current || points.length === 0) return
    last.current = key
    map.invalidateSize()
    map.fitBounds(L.latLngBounds(points), {
      animate: false, maxZoom: FIT_MAX_ZOOM,
      paddingTopLeft: [padding.left, padding.top], paddingBottomRight: [padding.right, padding.bottom],
    })
  }, [map, key, points, padding])
  return null
}

export default function SchematicMap({ model, fill, padding, onSpot, still }: {
  model: MapModel; fill: boolean; padding: Padding; onSpot?: (id: string) => void
  /** Low-Battery Mode: no animation, no wheel zoom. */
  still: boolean
}) {
  return (
    <MapContainer className="map-schematic" center={model.campus} zoom={14} minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM} attributionControl={false} zoomControl={false}
      scrollWheelZoom={fill && !still} zoomAnimation={!still} fadeAnimation={!still} markerZoomAnimation={!still}>
      <ZoomControl position={fill ? 'topright' : 'bottomright'} />
      <SizeSync />
      <Fit points={model.fit} padding={padding} />
      <Declutter version={model.lines.map((l) => `${l.id}${l.status}${l.focus}`).join() + model.spots.map((x) => `${x.id}${x.selected}`).join()} />
      {model.lines.map((l) => (
        <Polyline key={`${l.id}-casing`} positions={l.path} className="line-casing" pathOptions={{ weight: l.focus ? 10 : 8, opacity: 1 }} interactive={false} />
      ))}
      {model.lines.map((l) => (
        <Polyline key={`${l.id}-${l.status}-${l.focus}`} positions={l.path} className={`line-${l.status} ${l.strong ? 'line-focus' : 'line-other'}`}
          pathOptions={{ weight: l.focus ? 6 : 4, opacity: 1 }} interactive={false} />
      ))}
      {model.lines.map((l) => l.labelAt && (
        <Marker key={`tag-${l.id}-${l.status}-${l.focus}`} position={l.labelAt} icon={tagIcon(l.status, l.via, l.focus)} interactive={false} keyboard={false} zIndexOffset={l.focus ? 300 : 200} />
      ))}
      {model.walk && (
        <>
          <Polyline positions={model.walk} className="line-casing" pathOptions={{ weight: 8, opacity: 1 }} interactive={false} />
          <Polyline positions={model.walk} className="line-walk" pathOptions={{ weight: 4, opacity: 1 }} interactive={false} />
        </>
      )}
      {model.ends.map((e) => (
        <Marker key={`end-${e.id}`} position={e.pos} icon={endIcon} title={`Destination: ${e.name}`} alt={`Destination: ${e.name}`} keyboard={false}>
          <Tooltip permanent direction="right" offset={[16, 0]} className="map-label map-label-spot">{e.name}</Tooltip>
        </Marker>
      ))}
      {model.spots.map((s) => (
        <Marker key={s.id + (s.selected ? '-on' : '')} position={s.pos} icon={spotIcon(s.full, s.selected)} title={s.label} alt={s.label}
          zIndexOffset={s.selected ? 500 : 0} keyboard={Boolean(onSpot)}
          eventHandlers={onSpot && !s.full ? { click: () => onSpot(s.id) } : undefined}>
          {s.selected && <Tooltip permanent direction="right" offset={[18, 0]} className="map-label map-label-spot">{s.short}</Tooltip>}
        </Marker>
      ))}
      <Marker position={model.campus} icon={campusIcon} title="Campus" alt="Campus" keyboard={false} zIndexOffset={800} />
    </MapContainer>
  )
}
