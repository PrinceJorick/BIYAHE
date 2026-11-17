import { Info } from 'lucide-react'
import { useState } from 'react'
import { CAMPUS_EXIT_NOTE, PREVIEW_NOTICE, previewRouteNotes, type PreviewRoute } from '../lib/previewGeometry'
import type { Corridor } from '../types'
import Dialog from './Dialog'

// Prototype route preview disclosure. On the map it is only a small "Demo routes" button; the full notice
// and every route's limitations open in a dialog on request. No Leaflet here, so it renders in tests.

type Item = { id: string; name: string; notes: string[] }

/** Limitations of the routes shown on this map (the shared campus-exit note is listed once, separately). */
function demoRouteItems(routes: readonly PreviewRoute[], shown: readonly Corridor[]): Item[] {
  return shown.flatMap((c) => {
    const r = routes.find((x) => x.routeId === c.id)
    if (!r) return []
    const notes = previewRouteNotes(r, c.name).filter((n) => n !== CAMPUS_EXIT_NOTE)
    return notes.length ? [{ id: c.id, name: c.name, notes }] : []
  })
}

export function DemoRoutesDetails({ routes, shown }: { routes: readonly PreviewRoute[]; shown: readonly Corridor[] }) {
  const items = demoRouteItems(routes, shown)
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="body">{PREVIEW_NOTICE}</p>
      <ul className="demo-route-notes">
        {items.map((x) => <li key={x.id}><strong>{x.name}:</strong> {x.notes.join(' ')}</li>)}
        <li><strong>All routes:</strong> {CAMPUS_EXIT_NOTE}</li>
      </ul>
    </div>
  )
}

export default function DemoRoutes({ routes, shown }: { routes: readonly PreviewRoute[]; shown: readonly Corridor[] }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="map-demo-badge" aria-haspopup="dialog" onClick={() => setOpen(true)}
        aria-label="Demo routes: unverified prototype preview. Show details and route limitations.">
        <Info size={14} aria-hidden="true" />Demo routes
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Demo routes (prototype preview)">
        <DemoRoutesDetails routes={routes} shown={shown} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
        </div>
      </Dialog>
    </>
  )
}
