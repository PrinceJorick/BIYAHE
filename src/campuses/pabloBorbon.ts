import { selectCorridorGeometry } from '../lib/previewGeometry'
import type { Campus, Corridor, LatLng } from '../types'
import { PABLO_BORBON_PREVIEW_ROADS } from './pablo-borbon.preview.roads'

// BatStateU Pablo Borbon, Rizal Ave., Batangas City.
// Location: the entrance students use when leaving to catch transportation.
// Coordinate source: OpenStreetMap node 8345194517 (barrier=gate),
//   https://www.openstreetmap.org/node/8345194517, rounded to 5 decimals (about 1 m) for the route geometry hash.
// Corroboration: local/community. A contact familiar with the campus confirmed this point is
//   the entrance students use. The user reported this confirmation on 2026-11-17. The date of
//   the contact's own site visit is unknown.
// This is NOT an official GPS survey, an on-site measurement with a known date, or a
//   georeferenced university measurement.
// Gate designation (e.g. "Gate 1") has NOT been independently confirmed. Do not label it as such.
const LOCATION: LatLng = [13.75547, 121.05364]

// Routes: the endpoint of each is a town hall or terminal from OpenStreetMap (see scripts/build-campus-roads.mjs).
// `via` names the longest road OSRM follows; `usualMin` is the OSRM driving time × 1.8 + 5 min for stops and
// waiting, rounded to 5. `commuters` are simulated demo counts, like Alangilan's.
// The paths here are fallbacks; the road-following paths in ./pablo-borbon.preview.roads.ts replace them.
export const PABLO_BORBON_HAND_DRAWN_CORRIDORS: Corridor[] = [
  { id: 'pb-lipa', name: 'Lipa City', via: 'JP Laurel Hwy', usualMin: 50, commuters: 180,
    path: [LOCATION, [13.7865, 121.0705], [13.8786, 121.1047], [13.9554, 121.1606]] },
  { id: 'pb-sanjose', name: 'San Jose', via: 'JP Laurel Hwy', usualMin: 35, commuters: 120,
    path: [LOCATION, [13.7865, 121.0705], [13.8786, 121.1047]] },
  { id: 'pb-bauan', name: 'Bauan / San Pascual', via: 'Bauan–Batangas Rd', usualMin: 30, commuters: 150,
    path: [LOCATION, [13.7703, 121.0381], [13.7938, 121.0071]] },
  { id: 'pb-rosario', name: 'Ibaan / Rosario', via: 'Batangas–Ibaan Rd', usualMin: 50, commuters: 90,
    path: [LOCATION, [13.8184, 121.1321], [13.8457, 121.2063]] },
]

export const pabloBorbonRouteGeometry = selectCorridorGeometry({
  handDrawn: PABLO_BORBON_HAND_DRAWN_CORRIDORS,
  formal: null,
  preview: PABLO_BORBON_PREVIEW_ROADS,
  previewEnabled: true,
  ctx: { campusId: 'pablo-borbon', anchor: LOCATION },
})

export const pabloBorbon: Campus = {
  id: 'pablo-borbon',
  name: 'Batangas State University - Pablo Borbon Campus',
  shortName: 'BatStateU Pablo Borbon',
  location: LOCATION,
  corridors: pabloBorbonRouteGeometry.corridors,
  spots: [
    { id: 'pb-gym', name: 'Leviste Multi-Purpose Gymnasium', walkMin: 4, capacity: 570,
      amenities: { power: true, water: true, food: false }, pos: [13.75302, 121.05289] },
    { id: 'pb-library', name: 'Main Library', walkMin: 3, capacity: 230,
      amenities: { power: true, water: false, food: false }, pos: [13.75453, 121.0526] },
  ],
}

// Where each waiting area's position and capacity come from (rule: SPOT_CAPACITY_RULE in ./index.ts).
// - Leviste Gymnasium: Governor Feliciano "Sanoy" Leviste Memorial Multi-Purpose Gymnasium, OpenStreetMap way
//   334825726, footprint 1,533 m²; facade on Wikimedia Commons. 1,533 × 0.75 ÷ 2 = 574 → 570. An arena list
//   gives about 4,000 for basketball events; that is spectator seating, not space to wait for hours.
// - Main Library: OpenStreetMap way 489731778 (amenity=library), footprint 774 m². 774 × 0.6 ÷ 2 = 232 → 230.
// Walking times: straight-line distance from LOCATION at about 75 m per minute, rounded up.
