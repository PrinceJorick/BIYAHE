import { straightLineWalkMin } from '../lib/coords'
import { selectCorridorGeometry } from '../lib/previewGeometry'
import type { Campus, Corridor, LatLng } from '../types'
import { ALANGILAN_PREVIEW_ROADS } from './alangilan.preview.roads'
import { alangilanRoads } from './alangilan.roads'

// BatStateU Alangilan, Batangas City
const LOCATION: LatLng = [13.7842, 121.0744]

// Hand-drawn corridor paths. They stay in use unless a complete, valid reviewed road set exists for all
// five corridors (./alangilan.roads.ts, currently null); see src/lib/reviewedGeometry.ts.
export const ALANGILAN_HAND_DRAWN_CORRIDORS: Corridor[] = [
  { id: 'lipa', name: 'Lipa City', via: 'JP Laurel Hwy', usualMin: 50, commuters: 140,
    path: [LOCATION, [13.7875, 121.0705], [13.7935, 121.0655], [13.8, 121.064], [13.81, 121.07]] },
  { id: 'batangas', name: 'Batangas City proper', via: 'P. Burgos', usualMin: 20, commuters: 210,
    path: [LOCATION, [13.778, 121.069], [13.77, 121.064], [13.7575, 121.058]] },
  { id: 'bauan', name: 'Bauan / San Pascual', via: 'Diversion Rd', usualMin: 35, commuters: 60,
    path: [LOCATION, [13.783, 121.062], [13.786, 121.045], [13.79, 121.02]] },
  { id: 'sanjose', name: 'San Jose / Ibaan', via: 'Batangas–Lipa Rd', usualMin: 30, commuters: 85,
    path: [LOCATION, [13.792, 121.085], [13.805, 121.1], [13.82, 121.115]] },
  { id: 'tanauan', name: 'Tanauan / Sto. Tomas', via: 'STAR Tollway', usualMin: 65, commuters: 45,
    path: [LOCATION, [13.795, 121.078], [13.82, 121.085], [13.85, 121.095]] },
]

// Road-following geometry (the OSRM-derived routes in ./alangilan.preview.roads.ts) is shown to users in every
// build, not only in the dev server: hand-drawn lines cut across fields and buildings. It is still validated at
// runtime (all five or none) and formal reviewed geometry, once approved, takes precedence.
export const PREVIEW_ON = true

// Formal reviewed paths (all five or none) take precedence; invalid formal data falls back to hand-drawn,
// never to the preview. Without formal data, the preview is used when enabled and valid (all five or none).
export const alangilanRouteGeometry = selectCorridorGeometry({
  handDrawn: ALANGILAN_HAND_DRAWN_CORRIDORS,
  formal: alangilanRoads,
  preview: PREVIEW_ON ? ALANGILAN_PREVIEW_ROADS : null,
  previewEnabled: PREVIEW_ON,
  ctx: { campusId: 'alangilan', anchor: LOCATION },
})
// Formal reviewed-geometry activation (Step 5), unchanged.
export const alangilanRoadActivation = alangilanRouteGeometry.formal
// For the development map warning: was reviewed data supplied, and was it used?
export const alangilanRoadStatus = { supplied: alangilanRoads !== null, active: alangilanRoadActivation.active, problems: alangilanRoadActivation.problems }
if (alangilanRoadStatus.supplied && !alangilanRoadStatus.active) {
  // Fail closed, but loudly in development: invalid reviewed data never reaches the map (the build check
  // rejects it first). Production logs no validation details.
  if (import.meta.env.DEV) console.error('Reviewed road data invalid — using hand-drawn routes:', alangilanRoadActivation.problems)
  else console.warn('Reviewed road data could not be used; showing hand-drawn routes.')
}

// Safe-spot positions: supplied by the project owner (Iteration 3, 2026-11-18), kept at full precision.
// They are owner-provided map points, not an on-site survey and not independently verified.
const SPOT_POS = {
  lounge: [13.78393267903075, 121.07417575704717],
  gym: [13.784276340529747, 121.07413074951742],
  library: [13.784168707874697, 121.0749349027738],
} satisfies Record<string, LatLng>

export const alangilan: Campus = {
  id: 'alangilan',
  name: 'Batangas State University - Alangilan Campus',
  shortName: 'BatStateU Alangilan',
  location: LOCATION,
  corridors: alangilanRouteGeometry.corridors,
  // Fixed attributes only; occupancy comes from the snapshot. Positions and capacities: see the notes below.
  spots: [
    { id: 'gym', name: 'Sparta Gymnasium', walkMin: straightLineWalkMin(LOCATION, SPOT_POS.gym), capacity: 1030,
      amenities: { power: true, water: true, food: false }, pos: SPOT_POS.gym },
    { id: 'library', name: 'Einstein Bldg Library, 2nd Floor', walkMin: straightLineWalkMin(LOCATION, SPOT_POS.library), capacity: 250,
      amenities: { power: true, water: false, food: false }, pos: SPOT_POS.library },
    // Capacity and amenities have not been supplied or assessed: null capacity ("not yet assessed") and no
    // amenities until a coordinator confirms them, rather than invented values.
    { id: 'lounge', name: 'Student Lounge', walkMin: straightLineWalkMin(LOCATION, SPOT_POS.lounge), capacity: null,
      amenities: { power: false, water: false, food: false }, pos: SPOT_POS.lounge },
  ],
}

// Where each waiting area's capacity comes from (positions: SPOT_POS above). Capacity = usable floor area ÷ 2 m²
// per person (see SPOT_CAPACITY_RULE in ./index.ts), rounded down to 10. The capacity estimates below were made
// from building footprints; the owner-supplied points fall inside the same buildings (within ~20 m of the
// earlier footprint-derived points), so the estimates still apply.
// walkMin: straight-line estimate from LOCATION (src/lib/coords.ts, WALK_M_PER_MIN), shown as an estimate.
// - Sparta Gymnasium: OpenStreetMap way 489736297 (leisure=sports_centre), footprint 2,766 m², which matches the
//   ~64 × 42 m curved roof in Esri World Imagery. 2,766 × 0.75 usable ÷ 2 = 1,037 → 1,030. BatStateU's
//   Fitness Development Center is reported to hold up to 4,000 for events (PIA, Jan 2023); that is event seating,
//   and it is not confirmed to be this building, so it is not used.
// - Library: the Alangilan (Foster Wheeler) library is on the 2nd floor of the Albert Einstein Building
//   (library.batstateu.edu.ph/about), formerly the engineering (CEAFACS) building. Its four-storey U-shaped
//   red roof east of the gym is matched from the Wikimedia Commons photo and satellite imagery; the point is
//   its centre. Area is an estimate: a third of the ~2,600 m² floor plate ≈ 860 m² × 0.6 usable ÷ 2 = 258 → 250.
// - Student Lounge (renamed in Iteration 3; records saved under the old ID are migrated by src/lib/spotData.ts):
//   position supplied by the project owner. No capacity or amenity source exists yet.
