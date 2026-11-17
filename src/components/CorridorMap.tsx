import L from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { BatteryLow } from 'lucide-react'
import { DEFAULT_CAMPUS } from '../campuses'
import { CAMPUS, corridors, type CorridorStatus, type LatLng } from '../data'
import { spacesLeft, studentView } from '../lib/derive'
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
  const key = JSON.stringify(points)
  useEffect(() => {
    map.invalidateSize()
    map.fitBounds(L.latLngBounds(JSON.parse(key)).pad(0.18), { animate: false })
  }, [map, key])
  return null
}

// Student: own corridor, walking line to the chosen safe spot. Staff: every corridor.
// Line pattern carries status without colour: solid = open, dotted = slow, dashed = closed.
export default function CorridorMap({ mode }: { mode: 'student' | 'staff' }) {
  const s = useApp()
  const v = studentView(s, useNow())
  const plain = isLowBattery(s)
  const shown = mode === 'staff' ? corridors : [v.corridor]
  const points: LatLng[] = mode === 'staff'
    ? corridors.flatMap((c) => c.path.slice(0, 3))
    : [CAMPUS, ...s.snapshot.spots.map((x) => x.pos), ...v.corridor.path.slice(1, 3)]

  return (
    <div className="map" role="group" aria-label={mode === 'staff' ? 'Route risk map. The same information is listed below.' : 'Map of your route and campus safe spots. The same information is listed in text.'}>
      <MapContainer key={plain ? 'plain' : 'tiles'} center={CAMPUS} zoom={15} scrollWheelZoom={!plain} zoomAnimation={!plain} fadeAnimation={!plain} markerZoomAnimation={!plain}>
        {!plain && <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' maxZoom={18} />}
        <Fit points={points} />
        {shown.map((c) => {
          const st = s.snapshot.corridors[c.id].status
          return (
            <Polyline key={c.id + st} positions={c.path} className={`line-${st}`} pathOptions={{ weight: st === 'slow' ? 6 : 5, opacity: 1 }}>
              <Tooltip permanent direction="center" className={`map-label ${tone[st]}`}>{word[st]} · {c.via}</Tooltip>
            </Polyline>
          )
        })}
        {mode === 'student' && v.spot && (
          <Polyline key={v.spot.id} positions={[CAMPUS, v.spot.pos]} className="line-walk" pathOptions={{ weight: 4, opacity: 1 }} />
        )}
        {s.snapshot.spots.map((x) => {
          const full = spacesLeft(x) <= 0
          const label = `${x.name}: ${full ? 'full' : `${spacesLeft(x)} spaces left`}`
          return (
            <Marker key={x.id} position={x.pos} icon={spotIcon(full, mode === 'student' && v.spot?.id === x.id)} title={label} alt={label}
              eventHandlers={mode === 'student' && !full ? { click: () => selectSpot(x.id) } : undefined} />
          )
        })}
        <Marker position={CAMPUS} icon={youIcon} title={DEFAULT_CAMPUS.shortName} alt={DEFAULT_CAMPUS.shortName} keyboard={false} />
      </MapContainer>
      {plain && (
        <p className="map-plain"><BatteryLow size={18} aria-hidden="true" />Simple map. Street tiles are off to save battery.</p>
      )}
    </div>
  )
}
