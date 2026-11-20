// Google Maps renderer for a MapModel (src/lib/mapModel.ts). Lines are google.maps.Polyline with a white casing;
// pins and labels are the app's own HTML, placed with an OverlayView and rendered through React portals, so they
// work on the default raster map (muted style) and on a cloud-styled vector map (VITE_GOOGLE_MAPS_MAP_ID) alike.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GOOGLE_MAP_ID } from '../../lib/googleRoutes'
import { loadGoogleMaps } from '../../lib/googleMapsLoader'
import type { MapLine, MapModel } from '../../lib/mapModel'
import { FIT_MAX_ZOOM, fitKey, MAX_ZOOM, MIN_ZOOM } from '../../lib/mapView'
import type { LatLng } from '../../types'
import { declutter } from './declutter'
import { CampusPin, EndPin, LineTag, SpotPin } from './pins'

const toLL = ([lat, lng]: LatLng): google.maps.LatLngLiteral => ({ lat, lng })

const DEEP = '#0B2D5B'
const SLATE = '#64748B'
const SKY = '#2563EB'

// Without a Map ID: Google's map, desaturated, without business pins, so the routes read first.
const MUTED: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ saturation: -70 }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ saturation: -100 }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ saturation: -40 }, { lightness: 10 }] },
]

type OverlayCtor = new (pos: google.maps.LatLngLiteral, el: HTMLElement, interactive: boolean, z: number) => google.maps.OverlayView
let OverlayClass: OverlayCtor | null = null

// google.maps.OverlayView exists only once the API has loaded, so the class is defined on first use.
function overlayClass(): OverlayCtor {
  if (OverlayClass) return OverlayClass
  class HtmlOverlay extends google.maps.OverlayView {
    private readonly pos: google.maps.LatLngLiteral
    private readonly el: HTMLElement
    private readonly interactive: boolean
    private readonly z: number
    constructor(pos: google.maps.LatLngLiteral, el: HTMLElement, interactive: boolean, z: number) {
      super()
      this.pos = pos
      this.el = el
      this.interactive = interactive
      this.z = z
      if (interactive) google.maps.OverlayView.preventMapHitsAndGesturesFrom(el)
    }
    onAdd() {
      this.el.style.zIndex = String(this.z)
      this.getPanes()?.[this.interactive ? 'overlayMouseTarget' : 'overlayLayer'].appendChild(this.el)
    }
    draw() {
      const p = this.getProjection()?.fromLatLngToDivPixel(this.pos)
      if (p) {
        this.el.style.left = `${p.x}px`
        this.el.style.top = `${p.y}px`
      }
    }
    onRemove() {
      this.el.remove()
    }
  }
  OverlayClass = HtmlOverlay
  return HtmlOverlay
}

function Overlay({ map, pos, interactive = false, z = 0, children }: { map: google.maps.Map; pos: LatLng; interactive?: boolean; z?: number; children: ReactNode }) {
  const [el] = useState(() => Object.assign(document.createElement('div'), { className: 'gm-anchor' }))
  const [lat, lng] = pos
  useEffect(() => {
    const ov = new (overlayClass())({ lat, lng }, el, interactive, z)
    ov.setMap(map)
    return () => ov.setMap(null)
  }, [map, el, lat, lng, interactive, z])
  return createPortal(children, el)
}

function pattern(status: MapLine['status'], color: string, weight: number): google.maps.IconSequence[] | undefined {
  if (status === 'open') return undefined
  const icon: google.maps.Symbol = status === 'slow'
    ? { path: google.maps.SymbolPath.CIRCLE, scale: weight / 2.4, fillColor: color, fillOpacity: 1, strokeOpacity: 0 }
    : { path: 'M 0,-1 0,1', scale: weight / 1.6, strokeColor: color, strokeOpacity: 1, strokeWeight: weight }
  return [{ icon, offset: '0', repeat: status === 'slow' ? `${weight * 2.4}px` : `${weight * 4}px` }]
}

// The two polylines are created once per line and updated in place: the model is rebuilt on every store update
// with new (equal) path arrays, so the path is compared by its coordinates, never by array identity.
function Line({ map, path, status, color, weight, z }: { map: google.maps.Map; path: LatLng[]; status: MapLine['status']; color: string; weight: number; z: number }) {
  const lines = useRef<{ casing: google.maps.Polyline; stroke: google.maps.Polyline } | null>(null)
  useEffect(() => {
    const casing = new google.maps.Polyline({ map, strokeColor: '#FFFFFF', strokeOpacity: 0.95, clickable: false })
    const stroke = new google.maps.Polyline({ map, clickable: false })
    lines.current = { casing, stroke }
    return () => {
      casing.setMap(null)
      stroke.setMap(null)
      lines.current = null
    }
  }, [map])
  const key = fitKey(path)
  useEffect(() => {
    const p = key ? key.split(';').map((pt) => toLL(pt.split(',').map(Number) as LatLng)) : []
    lines.current?.casing.setPath(p)
    lines.current?.stroke.setPath(p)
  }, [map, key])
  useEffect(() => {
    const icons = pattern(status, color, weight)
    lines.current?.casing.setOptions({ strokeWeight: weight + 4, zIndex: z })
    lines.current?.stroke.setOptions({ strokeColor: color, strokeOpacity: icons ? 0 : 1, strokeWeight: weight, icons: icons ?? [], zIndex: z + 1 })
  }, [map, status, color, weight, z])
  return null
}

export type Padding = { top: number; right: number; bottom: number; left: number }

export default function GoogleMapView({ model, fill, padding, traffic, onSpot }: {
  model: MapModel; fill: boolean; padding: Padding; traffic: boolean; onSpot?: (id: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  // The first campus centres the new map; later changes are handled by the fit below, without a new map.
  const start = useRef(model.campus)

  // One google.maps.Map (one billable map load) per mount. Campus, routes, pins and traffic update it in place.
  useEffect(() => {
    let cancelled = false
    let created: google.maps.Map | null = null
    loadGoogleMaps()
      .then(() => google.maps.importLibrary('maps'))
      .then(() => {
        if (cancelled || !el.current) return
        const [lat, lng] = start.current
        created = new google.maps.Map(el.current, {
          center: { lat, lng }, zoom: 14, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM,
          ...(GOOGLE_MAP_ID ? { mapId: GOOGLE_MAP_ID } : { styles: MUTED }),
          disableDefaultUI: true, zoomControl: true, clickableIcons: false, keyboardShortcuts: true,
        })
        setMap(created)
      })
      .catch(() => { /* status is reported by googleMapsLoader; MapView switches to the simple map */ })
    return () => {
      cancelled = true
      if (created) google.maps.event.clearInstanceListeners(created)
    }
  }, [])

  // Full-screen or inline: controls and gestures change in place.
  useEffect(() => {
    map?.setOptions({
      zoomControlOptions: { position: fill ? google.maps.ControlPosition.RIGHT_CENTER : google.maps.ControlPosition.RIGHT_BOTTOM },
      gestureHandling: fill ? 'greedy' : 'cooperative',
    })
  }, [map, fill])

  // Fit the features on screen whenever they (or the space kept clear for panels) change. The key strings are
  // the source of truth, so a re-render with equal points never refits (and never fights the user's panning).
  const fit = fitKey(model.fit)
  const pad = `${padding.top},${padding.right},${padding.bottom},${padding.left}`
  useEffect(() => {
    const points = fit ? fit.split(';').map((p) => p.split(',').map(Number) as LatLng) : []
    if (!map || points.length === 0) return
    const b = new google.maps.LatLngBounds()
    for (const p of points) b.extend(toLL(p))
    const [top, right, bottom, left] = pad.split(',').map(Number)
    map.fitBounds(b, { top, right, bottom, left })
    const once = google.maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > FIT_MAX_ZOOM) map.setZoom(FIT_MAX_ZOOM)
    })
    return () => once.remove()
  }, [map, fit, pad])

  // Hide labels that would cover a pin or a more important label, whenever the view settles or the labels change.
  const root = useRef<HTMLDivElement>(null)
  const labels = model.lines.map((l) => `${l.id}${l.status}${l.focus}`).join() + model.spots.map((x) => `${x.id}${x.selected}`).join()
  useEffect(() => {
    if (!map) return
    const l = map.addListener('idle', () => declutter(root.current))
    const t = setTimeout(() => declutter(root.current), 50)
    return () => {
      l.remove()
      clearTimeout(t)
    }
  }, [map, labels])

  useEffect(() => {
    if (!map || !traffic) return
    const layer = new google.maps.TrafficLayer()
    layer.setMap(map)
    return () => layer.setMap(null)
  }, [map, traffic])

  return (
    <div className="gmap" ref={root}>
      <div ref={el} className="gmap-canvas" />
      {map && (
        <>
          {model.lines.map((l) => (
            <Line key={`${l.id}-${l.source}`} map={map} path={l.path} status={l.status} color={l.strong ? DEEP : SLATE} weight={l.focus ? 6 : 4} z={l.focus ? 20 : 10} />
          ))}
          {model.walk && <Line key="walk" map={map} path={model.walk} status="open" color={SKY} weight={4} z={30} />}
          {model.lines.map((l) => l.labelAt && (
            <Overlay key={`tag-${l.id}`} map={map} pos={l.labelAt} z={l.focus ? 3 : 2}><LineTag line={l} /></Overlay>
          ))}
          {model.ends.map((e) => <Overlay key={`end-${e.id}`} map={map} pos={e.pos} z={4}><EndPin name={e.name} /></Overlay>)}
          {model.spots.map((s) => (
            <Overlay key={s.id} map={map} pos={s.pos} interactive={Boolean(onSpot)} z={s.selected ? 6 : 5}>
              <SpotPin spot={s} onClick={onSpot && !s.full ? () => onSpot(s.id) : undefined} />
            </Overlay>
          ))}
          <Overlay map={map} pos={model.campus} z={7}><CampusPin /></Overlay>
        </>
      )}
    </div>
  )
}
