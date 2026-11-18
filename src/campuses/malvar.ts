import { straightLineWalkMin } from '../lib/coords'
import { selectCorridorGeometry } from '../lib/previewGeometry'
import type { Campus, Corridor, LatLng } from '../types'
import { MALVAR_PREVIEW_ROADS } from './malvar.preview.roads'

// BatStateU JPLPC-Malvar, G. Leviste St., Malvar, Batangas.
// Location: G. Leviste Street frontage outside the pedestrian entrance, the commuter departure
//   point for students leaving campus.
// Coordinate source: Google Maps pin supplied by the project team.
// This is a map-derived coordinate. It is NOT an official GPS survey, was NOT published by the
//   university, and has NOT been independently verified on-site.
// Context: BatStateU's procurement document for the campus gate construction identifies a
//   pedestrian entrance with turnstiles separately from the vehicle entrance and exit. It supports
//   the existence of separate pedestrian access but does not establish this coordinate.
// Gate designation ("Gate 1") has NOT been confirmed. Do not label it as such.
// Do NOT replace this with the OSM/Mapcarta campus polygon center [14.04483, 121.15630].
//   That is only a geographic center reference, not the commuter departure point.
const LOCATION: LatLng = [14.044900, 121.156900]

// Routes: same method as Pablo Borbon (see ./pabloBorbon.ts and scripts/build-campus-roads.mjs).
export const MALVAR_HAND_DRAWN_CORRIDORS: Corridor[] = [
  { id: 'mv-lipa', name: 'Lipa City', via: 'JP Laurel Hwy', usualMin: 25, commuters: 160,
    path: [LOCATION, [14.0001, 121.1597], [13.9554, 121.1606]] },
  { id: 'mv-tanauan', name: 'Tanauan City', via: 'STAR Tollway', usualMin: 20, commuters: 140,
    path: [LOCATION, [14.0702, 121.1417], [14.0866, 121.1259]] },
  { id: 'mv-stotomas', name: 'Sto. Tomas', via: 'JP Laurel Hwy', usualMin: 20, commuters: 110,
    path: [LOCATION, [14.0786, 121.1497], [14.108, 121.1462]] },
  { id: 'mv-batangas', name: 'Batangas City', via: 'JP Laurel Hwy', usualMin: 55, commuters: 60,
    path: [LOCATION, [13.9554, 121.1606], [13.8786, 121.1047], [13.7904, 121.061]] },
]

export const malvarRouteGeometry = selectCorridorGeometry({
  handDrawn: MALVAR_HAND_DRAWN_CORRIDORS,
  formal: null,
  preview: MALVAR_PREVIEW_ROADS,
  previewEnabled: true,
  ctx: { campusId: 'malvar', anchor: LOCATION },
})

// Safe-spot position: supplied by the project owner (Iteration 3, 2026-11-18), at full precision.
// An owner-provided map point, not an on-site survey and not independently verified.
const SPOT_POS = {
  gym: [14.044572113490197, 121.15574880496467],
} satisfies Record<string, LatLng>

export const malvar: Campus = {
  id: 'malvar',
  name: 'Batangas State University - JPLPC-Malvar Campus',
  shortName: 'BatStateU JPLPC-Malvar',
  location: LOCATION,
  corridors: malvarRouteGeometry.corridors,
  spots: [
    { id: 'mv-gym', name: 'Gymnasium', walkMin: straightLineWalkMin(LOCATION, SPOT_POS.gym), capacity: null,
      amenities: { power: true, water: true, food: false }, pos: SPOT_POS.gym },
  ],
}

// Capacity (rule: SPOT_CAPACITY_RULE in ./index.ts).
// - Gymnasium: capacity is null ("not yet assessed"). The earlier 280 estimate measured a barrel-roofed hall in
//   Esri World Imagery at [14.04492, 121.15685] (about 22 × 35 m). The owner-supplied gymnasium point is about
//   125 m west of that hall, so the measurement may describe a different building and is no longer used.
//   Re-measure the pinned building (usable area × 0.75 ÷ 2) before entering a capacity.
// - The library is in the Administration Building (library.batstateu.edu.ph/about), but which roof that is
//   could not be told from imagery, so it is not listed yet.
