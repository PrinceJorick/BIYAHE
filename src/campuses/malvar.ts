import type { Campus, LatLng } from '../types'

// IDENTITY-ONLY CONFIGURATION: NOT READY FOR STUDENT USE.
// Corridors and safe spots are deliberately empty until verified data is supplied.
// Registered in the campus registry, but not selected by any current runtime consumer
//   (every consumer uses DEFAULT_CAMPUS, Alangilan), not shown in the UI, and not used by
//   student or coordinator features.
// Do not make this the default campus, or reachable from the UI, while corridors or spots are empty.

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

export const malvar: Campus = {
  id: 'malvar',
  name: 'Batangas State University - JPLPC-Malvar Campus',
  shortName: 'BatStateU JPLPC-Malvar',
  location: LOCATION,
  corridors: [],
  spots: [],
}
