import L from 'leaflet'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { Circle, MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet'
import { floodZone, saferRoute, spots, usualRoute, youAreHere, type Scenario } from '../data'

const dot = (color: string) =>
  L.divIcon({ className: '', html: `<div class="pin" style="background:${color}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] })

export default function SafeSpots({ scenario }: { scenario: Scenario }) {
  const disrupted = scenario !== 'clear'

  return (
    <>
      <div className="map">
        <MapContainer bounds={L.latLngBounds(usualRoute).pad(0.15)} zoomControl={false} attributionControl={false} style={{ height: '100%' }}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Polyline positions={usualRoute} pathOptions={{ color: disrupted ? '#b4232a' : '#14213d', weight: 4, opacity: 0.85, dashArray: disrupted ? '6 8' : undefined }} />
          {disrupted && <Polyline positions={saferRoute} pathOptions={{ color: '#1f7a4d', weight: 4 }} />}
          {disrupted && <Circle center={floodZone} radius={260} pathOptions={{ color: '#b4232a', weight: 1, fillOpacity: 0.12 }} />}
          {spots.map((s) => <Marker key={s.id} position={s.pos} icon={dot(s.left ? '#1f7a4d' : '#80858d')} />)}
          <Marker position={youAreHere} icon={dot('#14213d')} />
        </MapContainer>
        <span className="map-attrib">© OpenStreetMap</span>
        {disrupted && (
          <div className="map-overlay">
            <div className="banner">
              <AlertTriangle size={16} color="var(--warn)" />
              <span>Your route is flooded. Wait on campus.</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '20px 20px 32px' }}>
        <h1 className="h2">Safe spots on campus</h1>
        <p className="meta">Verified by Campus DRRM 4 min ago</p>
        <div className="legend" style={{ marginTop: 12 }}>
          <span><i style={{ background: disrupted ? 'var(--warn)' : 'var(--brand)' }} />Usual route</span>
          {disrupted && <span><i style={{ background: 'var(--ok)' }} />Safer route</span>}
          <span><i style={{ background: 'var(--ok)', width: 8, height: 8, borderRadius: 9 }} />Safe spot</span>
        </div>

        <ul className="list" style={{ listStyle: 'none', marginTop: 8 }}>
          {spots.map((s) => (
            <li key={s.id}>
              <button className="item" style={{ width: '100%', textAlign: 'left', alignItems: 'center' }} disabled={!s.left}>
                <div style={{ flex: 1, opacity: s.left ? 1 : 0.5 }}>
                  <p className="h3">{s.name}</p>
                  <p className="meta">
                    {s.walkMin} min walk{s.amenities.length > 0 && ` · ${s.amenities.join(', ')}`}
                  </p>
                </div>
                <span className="num" style={{ fontSize: 14, color: s.left ? 'var(--ok)' : 'var(--ink-3)' }}>
                  {s.left ? `${s.left} left` : 'Full'}
                </span>
                {s.left > 0 && <ChevronRight size={16} color="var(--ink-3)" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
