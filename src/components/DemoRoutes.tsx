import { Info } from 'lucide-react'
import { useState } from 'react'
import { CAMPUS_EXIT_NOTE, PREVIEW_NOTICE, previewRouteNotes, type PreviewRoute } from '../lib/previewGeometry'
import type { Corridor } from '../types'
import Dialog from './Dialog'

// Route geometry disclosure. On the map it is only a small "About routes" button; the full notice and every
// route's limitations open in a dialog on request. No Leaflet here, so it renders in tests.

type Item = { id: string; name: string; notes: string[] }

/** Limitations of the routes shown on this map (the shared campus-exit note is listed once, separately). */
function demoRouteItems(routes: readonly PreviewRoute[], shown: readonly Corridor[], exitNote: string | null): Item[] {
  return shown.flatMap((c) => {
    const r = routes.find((x) => x.routeId === c.id)
    if (!r) return []
    const notes = previewRouteNotes(r, c.name).filter((n) => n !== exitNote)
    return notes.length ? [{ id: c.id, name: c.name, notes }] : []
  })
}

type Props = { routes: readonly PreviewRoute[]; shown: readonly Corridor[]; exitNote?: string | null }

export function DemoRoutesDetails({ routes, shown, exitNote = CAMPUS_EXIT_NOTE }: Props) {
  const items = demoRouteItems(routes, shown, exitNote)
  return (
    <div className="stack" style={{ gap: 12 }}>
      <p className="body">{PREVIEW_NOTICE}</p>
      <ul className="demo-route-notes">
        {items.map((x) => <li key={x.id}><strong>{x.name}:</strong> {x.notes.join(' ')}</li>)}
        {exitNote && <li><strong>All routes:</strong> {exitNote}</li>}
      </ul>
    </div>
  )
}

export default function DemoRoutes({ routes, shown, exitNote = CAMPUS_EXIT_NOTE }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="map-demo-badge" aria-haspopup="dialog" onClick={() => setOpen(true)}
        aria-label="About routes: generated from OpenStreetMap, not checked on site. Show details and route limitations.">
        <Info size={14} aria-hidden="true" />About routes
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="About these routes">
        <DemoRoutesDetails routes={routes} shown={shown} exitNote={exitNote} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
        </div>
      </Dialog>
    </>
  )
}
