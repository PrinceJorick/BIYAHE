import type { Campus, LatLng } from '../types'

// BatStateU Alangilan, Batangas City
const LOCATION: LatLng = [13.7842, 121.0744]

export const alangilan: Campus = {
  id: 'alangilan',
  name: 'Batangas State University - Alangilan Campus',
  shortName: 'BatStateU Alangilan',
  location: LOCATION,
  corridors: [
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
  ],
  // Fixed attributes only; occupancy comes from the snapshot. Order matters: fixtures assign
  // occupancy by position (cics, gym, library).
  spots: [
    { id: 'cics', name: 'CICS Lobby', walkMin: 3, capacity: 180,
      amenities: { power: true, water: true, food: true }, pos: [13.7849, 121.0745] },
    { id: 'gym', name: 'Gymnasium', walkMin: 6, capacity: 500,
      amenities: { power: true, water: true, food: false }, pos: [13.7838, 121.0727] },
    { id: 'library', name: 'Library', walkMin: 4, capacity: 150,
      amenities: { power: true, water: false, food: false }, pos: [13.7832, 121.0752] },
  ],
}
