// Persistent map attribution and map wiring.
// MapFrame is rendered for real (server-side rendering, no DOM). CorridorMap and the screens import Leaflet,
// which needs a browser window, so their wiring is checked with narrow source guards instead.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ALANGILAN_HAND_DRAWN_CORRIDORS } from '../campuses/alangilan'
import { ALANGILAN_PREVIEW_ROADS } from '../campuses/alangilan.preview.roads'
import { CAMPUS_EXIT_NOTE, PREVIEW_NOTICE } from '../lib/previewGeometry'
import corridorMapSource from './CorridorMap.tsx?raw'
import DemoRoutes, { DemoRoutesDetails } from './DemoRoutes'
import MapFrame from './MapFrame'
import homeSource from '../screens/Home.tsx?raw'
import safeSpotsSource from '../screens/SafeSpots.tsx?raw'
import appSource from '../App.tsx?raw'
import coordinatorSource from '../screens/Coordinator.tsx?raw'

const render = (props: { warning?: string | null }, child = createElement('div', { className: 'leaflet-container' })) =>
  renderToStaticMarkup(createElement(MapFrame, { label: 'Test map', ...props }, child))

describe('MapFrame: persistent OpenStreetMap attribution', () => {
  it('always renders the credit with the copyright link', () => {
    const html = render({})
    expect(html).toContain('<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>')
    expect(html).toContain('class="map-attribution"')
  })

  it('renders the credit whatever the map content is (tiles, Low-Battery Mode without tiles, any geometry)', () => {
    for (const child of [createElement('div', { className: 'leaflet-container' }), createElement('p', { className: 'map-plain' }, 'Simple map'), null]) {
      expect(render({}, child as never)).toContain('© OpenStreetMap contributors · ODbL')
    }
  })

  it('uses no external images, scripts or styles (works offline from the bundle)', () => {
    const html = render({})
    expect(html).not.toMatch(/<img|<script|<link|src=/)
  })

  it('shows a warning only when one is passed (the caller passes null in production)', () => {
    expect(render({ warning: null })).not.toContain('map-dev-warning')
    expect(render({})).not.toContain('map-dev-warning')
    expect(render({ warning: 'Reviewed road data invalid' })).toContain('<p class="map-dev-warning" role="alert">Reviewed road data invalid</p>')
  })
})

describe('road-following routes: subtle "About routes" indicator', () => {
  const routes = ALANGILAN_PREVIEW_ROADS.routes
  const all = ALANGILAN_HAND_DRAWN_CORRIDORS
  const onMap = (shown = all) => renderToStaticMarkup(createElement(MapFrame, { label: 'Test map', notice: createElement(DemoRoutes, { routes, shown }) }, null))

  it('shows only a small "About routes" button on the map; no banner and no limitations list over the map', () => {
    const html = onMap()
    expect(html).toContain('class="map-demo-badge"')
    expect(html).toContain('aria-haspopup="dialog" aria-label="About routes: generated from OpenStreetMap, not checked on site. Show details and route limitations."')
    expect(html).toContain('About routes</button>')
    expect(html).not.toContain(PREVIEW_NOTICE)                 // the large banner paragraph
    expect(html).not.toContain('Route limitations')
    expect(html).not.toMatch(/<details|<ul|<li/)
    expect(html).not.toContain('map-preview-notice')
    expect(html).not.toContain('430.1')
    // the dialog stays closed (empty) until the button is used
    expect(html).toMatch(/<dialog[^>]*class="dialog"[^>]*><\/dialog>/)
  })

  it('keeps the OSM credit and copyright link alongside it', () => {
    expect(onMap()).toContain('<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>')
  })

  it('without preview geometry there is no indicator', () => {
    expect(render({})).not.toContain('map-demo-badge')
  })

  it('the details dialog holds the full notice and every limitation (coordinator: all five routes)', () => {
    const html = renderToStaticMarkup(createElement(DemoRoutesDetails, { routes, shown: all }))
    expect(html).toContain(PREVIEW_NOTICE)
    expect(html).toContain('Lipa City:</strong> Partial route, not a complete trip to Lipa City.')
    expect(html).toContain('Tanauan / Sto. Tomas:</strong> Partial route, not a complete trip to Tanauan / Sto. Tomas.')
    expect(html).toMatch(/Bauan \/ San Pascual:<\/strong>[^<]*430\.1 m destination overshoot/)
    expect(html).toMatch(/San Jose \/ Ibaan:<\/strong>[^<]*STAR mainline, 202\.5 m from the configured destination[^<]*no pedestrian connection to the destination has been verified/)
    expect(html).toContain(`All routes:</strong> ${CAMPUS_EXIT_NOTE}`)
    expect(html).not.toContain('Batangas City proper:')        // no route-specific limitation beyond the campus exit
  })

  it('a student sees the limitations of their own route plus the campus exit', () => {
    const sanjose = all.filter((c) => c.id === 'sanjose')
    const html = renderToStaticMarkup(createElement(DemoRoutesDetails, { routes, shown: sanjose }))
    expect(html).toContain('San Jose / Ibaan:')
    expect(html).not.toContain('Lipa City:')
    expect(html).toContain(CAMPUS_EXIT_NOTE)
  })

  it('a campus without a campus-wide limitation lists none under "All routes"', () => {
    const html = renderToStaticMarkup(createElement(DemoRoutesDetails, { routes: routes.map((r) => ({ ...r, pathEnds: null, warnings: [] })), shown: all, exitNote: null }))
    expect(html).toContain(PREVIEW_NOTICE)
    expect(html).not.toContain('All routes:')
    expect(html).not.toContain(CAMPUS_EXIT_NOTE)
  })

  it('CorridorMap shows the indicator whenever road-following routes are drawn, for the active campus', () => {
    expect(corridorMapSource).toContain('const preview = routes.selection.previewRoutes')
    expect(corridorMapSource).toContain('const notice = preview && <DemoRoutes routes={preview} shown={shown} exitNote={routes.exitNote} />')
    expect(corridorMapSource).toContain('notice={notice}')
    expect(corridorMapSource).not.toMatch(/PREVIEW_NOTICE|<details|Route limitations|map-preview/)
  })
})

describe('map wiring (source guards)', () => {
  it('CorridorMap wraps its map in MapFrame and turns off Leaflet\'s own attribution', () => {
    expect(corridorMapSource).toMatch(/<MapFrame[\s>]/)
    expect(corridorMapSource).toContain('attributionControl={false}')
    expect(corridorMapSource).not.toMatch(/attribution=['"{]/)
  })

  it('CorridorMap applies the zoom limits and the capped, padded fit', () => {
    expect(corridorMapSource).toContain('minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}')
    expect(corridorMapSource).toContain('padding: [FIT_PADDING_PX, FIT_PADDING_PX], maxZoom: FIT_MAX_ZOOM')
    expect(corridorMapSource).not.toContain('.pad(')
  })

  it('no straight line is drawn from campus to a safe spot', () => {
    expect(corridorMapSource).not.toContain('line-walk')
    expect(corridorMapSource).not.toMatch(/positions=\{\[CAMPUS,/)
    // The only polylines are the corridor paths.
    expect(corridorMapSource.match(/<Polyline/g)).toHaveLength(1)
    expect(corridorMapSource).toContain('positions={c.path}')
  })

  it('the development warning is computed only in development', () => {
    expect(corridorMapSource).toContain('import.meta.env.DEV ? devRoadDataWarning(alangilanRoadStatus, true) : null')
  })

  it('each map gets the extent for what it shows', () => {
    expect(safeSpotsSource).toContain('<CorridorMap mode="student" extent="nearby" />')
    expect(appSource).toContain('<CorridorMap mode="student" />')      // side pane: whole route (default)
    expect(coordinatorSource).toContain('<CorridorMap mode="staff" />')
  })

  it('walking times are worded as estimates and the Google Maps link is marked external', () => {
    expect(homeSource).toContain('walkEstimate(spot.walkMin)')
    expect(safeSpotsSource).toContain('walkEstimate(x.walkMin)')
    expect(`${homeSource}${safeSpotsSource}`).not.toMatch(/\{(spot|x)\.walkMin\} min/)
    expect(safeSpotsSource).toContain('href={googleMapsDirectionsUrl(spot.pos)}')
    expect(safeSpotsSource).toContain('Directions in Google Maps (external, needs internet)')
    expect(safeSpotsSource).toContain('BIYAHE has not checked it')
    expect(safeSpotsSource).not.toContain('Walk to {spot.name}')
  })
})
