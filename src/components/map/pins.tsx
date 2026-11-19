// Map markers and labels shared by both map renderers. Meaning is carried by icon + text; the only colour that
// signals a level is the status word itself (lvl-* text).
import { Ban, Check, Flag } from 'lucide-react'
import { statusLevel, statusWord, type MapLine, type MapSpot } from '../../lib/mapModel'
import { LogoMark } from '../Logo'

export function LineTag({ line }: { line: Pick<MapLine, 'status' | 'via' | 'focus'> }) {
  return (
    <span className={`map-tag${line.focus ? ' map-tag-focus' : ''}`}>
      <b className={`lvl lvl-${statusLevel[line.status]}`}>{statusWord[line.status]}</b> · {line.via}
    </span>
  )
}

export function SpotPin({ spot, onClick }: { spot: MapSpot; onClick?: () => void }) {
  const Icon = spot.full ? Ban : Check
  const body = (
    <>
      <span className={`pin${spot.selected ? ' pin-selected' : ''}${spot.full ? ' pin-full' : ''}`}><Icon size={16} strokeWidth={3} aria-hidden="true" /></span>
      {(spot.selected || onClick) && <span className="map-tag map-tag-spot">{spot.short}</span>}
    </>
  )
  return onClick
    ? <button type="button" className="map-marker" aria-label={spot.label} title={spot.label} onClick={onClick}>{body}</button>
    : <span className="map-marker" role="img" aria-label={spot.label} title={spot.label}>{body}</span>
}

export const CampusPin = () => (
  <span className="map-marker map-campus" role="img" aria-label="Campus"><LogoMark size={30} sun={false} /></span>
)

export const EndPin = ({ name }: { name: string }) => (
  <span className="map-marker map-end" role="img" aria-label={`Destination: ${name}`}>
    <span className="pin pin-end"><Flag size={14} strokeWidth={2.5} aria-hidden="true" /></span>
    <span className="map-tag map-tag-spot">{name}</span>
  </span>
)
