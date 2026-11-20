// Map attribution and map wiring.
// MapFrame is rendered for real (server-side rendering, no DOM). The map renderers import Leaflet or need the
// Google Maps API in a browser window, so their wiring is checked with narrow source guards instead.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ALANGILAN_HAND_DRAWN_CORRIDORS } from '../campuses/alangilan'
import { ALANGILAN_PREVIEW_ROADS } from '../campuses/alangilan.preview.roads'
import { CAMPUS_EXIT_NOTE, PREVIEW_NOTICE } from '../lib/previewGeometry'
import DemoRoutes, { DemoRoutesDetails } from './DemoRoutes'
import MapFrame from './MapFrame'
import mapViewSource from './map/MapView.tsx?raw'
import schematicSource from './map/SchematicMap.tsx?raw'
import googleSource from './map/GoogleMapView.tsx?raw'
import walkPanelSource from './WalkPanel.tsx?raw'
import placesSource from '../lib/places.ts?raw'
import coordinatorSource from '../screens/Coordinator.tsx?raw'
import mapScreenSource from '../screens/MapScreen.tsx?raw'
import destinationSource from '../screens/Destination.tsx?raw'

const render = (props: { warning?: string | null }, child = createElement('div', { className: 'leaflet-container' })) =>
  renderToStaticMarkup(createElement(MapFrame, { label: 'Test map', ...props }, child))

describe('MapFrame: OpenStreetMap attribution', () => {
  it('renders the credit with the copyright link by default', () => {
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

  it('omits the credit only when the map draws no OSM-derived geometry (credit={false})', () => {
    const html = renderToStaticMarkup(createElement(MapFrame, { label: 'Test map', credit: false }, null))
    expect(html).not.toContain('OpenStreetMap')
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
    expect(html).toContain('About routes</span></button>')
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

  it('MapView shows the indicator whenever OSM road-following routes are drawn, for the active campus', () => {
    expect(mapViewSource).toContain('const preview = routeGeometry[ACTIVE_CAMPUS.id].selection.previewRoutes')
    expect(mapViewSource).toContain("l.source === 'osm'")
    expect(mapViewSource).toContain('notice={notice}')
    expect(mapViewSource).not.toMatch(/PREVIEW_NOTICE|<details|Route limitations|map-preview/)
  })
})

describe('map wiring (source guards)', () => {
  it('MapView wraps both renderers in MapFrame and credits OSM whenever OSM geometry or OSM tiles are drawn', () => {
    expect(mapViewSource).toMatch(/<MapFrame[\s>]/)
    expect(mapViewSource).toContain('credit={model.osmCredit || osm}')
    expect(mapViewSource).toContain('<GoogleMapView ')
    expect(mapViewSource).toContain('<SchematicMap ')
  })

  it('the simple map draws OSM street tiles without Google (online or offline from saved tiles), never on low battery', () => {
    expect(schematicSource).toContain('attributionControl={false}')
    expect(schematicSource).toContain('{tiles && <TileLayer')
    expect(mapViewSource).toContain("const osm = why === 'nokey' || why === 'error' || why === 'offline'")
    expect(mapViewSource).toContain('tiles={osm}')
  })

  it('both renderers apply the zoom limits and the capped fit', () => {
    expect(schematicSource).toContain('minZoom={MIN_ZOOM} maxZoom={MAX_ZOOM}')
    expect(schematicSource).toContain('maxZoom: FIT_MAX_ZOOM')
    expect(googleSource).toContain('minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM')
    expect(googleSource).toContain('FIT_MAX_ZOOM')
  })

  it('no straight line is drawn from campus to a safe spot: only model.walk (mapped geometry) is drawn', () => {
    for (const src of [schematicSource, googleSource]) {
      expect(src).not.toMatch(/positions=\{\[model\.campus,|path=\{\[model\.campus,/)
      expect(src).toContain('model.walk')
    }
  })

  it('the development warning is computed only in development', () => {
    expect(mapViewSource).toContain('import.meta.env.DEV ? devRoadDataWarning(alangilanRoadStatus, true) : null')
  })

  it('each map gets what it shows', () => {
    expect(mapScreenSource).toContain('<MapView mode="student" fill ')
    expect(destinationSource).toContain('<MapView mode="student" focus=')
    expect(coordinatorSource).toContain('<MapView mode="staff" ')
  })

  it('walking times are worded as estimates and the Google Maps link is marked external', () => {
    expect(placesSource).toContain('export const walkText = (min: number) => `about ${min} min walk`')
    expect(walkPanelSource).toContain('href={googleMapsDirectionsUrl(spot.pos)}')
    expect(walkPanelSource).toContain('opens outside BIYAHE, needs internet')
    expect(walkPanelSource).toContain('BIYAHE has not checked it')
  })
})
