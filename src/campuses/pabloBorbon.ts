import type { Campus, LatLng } from '../types'

// IDENTITY-ONLY CONFIGURATION: NOT READY FOR STUDENT USE.
// Corridors and safe spots are deliberately empty until Stage 2B supplies verified data.
// Nothing reads this record at runtime: every consumer uses DEFAULT_CAMPUS (Alangilan).
// Do not make this the default campus, or reachable from the UI, while corridors or spots are empty.

// BatStateU Pablo Borbon, Rizal Ave., Batangas City.
// Location: the entrance students use when leaving to catch transportation.
// Coordinate source: OpenStreetMap node 8345194517 (barrier=gate),
//   https://www.openstreetmap.org/node/8345194517
// Corroboration: local/community. A contact familiar with the campus confirmed this point is
//   the entrance students use. The user reported this confirmation on 2026-11-17. The date of
//   the contact's own site visit is unknown.
// This is NOT an official GPS survey, an on-site measurement with a known date, or a
//   georeferenced university measurement.
// Gate designation (e.g. "Gate 1") has NOT been independently confirmed. Do not label it as such.
const LOCATION: LatLng = [13.7554660, 121.0536404]

export const pabloBorbon: Campus = {
  id: 'pablo-borbon',
  name: 'Batangas State University - Pablo Borbon Campus',
  shortName: 'BatStateU Pablo Borbon',
  location: LOCATION,
  corridors: [],
  spots: [],
}
