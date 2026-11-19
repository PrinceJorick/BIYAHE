// Campus registry: the single home for campus reference data (location, corridors, safe spots).
// The campus in use is chosen by the student or staff member (see ./active.ts); DEFAULT_CAMPUS is the
// fallback when nothing has been chosen yet.
import type { Campus, CampusId } from '../types'
import { alangilan } from './alangilan'
import { malvar } from './malvar'
import { pabloBorbon } from './pabloBorbon'

export const campuses: Record<CampusId, Campus> = { alangilan, 'pablo-borbon': pabloBorbon, malvar }

// Order shown in campus pickers.
export const CAMPUS_IDS: CampusId[] = ['alangilan', 'pablo-borbon', 'malvar']

export const DEFAULT_CAMPUS_ID: CampusId = 'alangilan'

// Short names for tight places (option tiles, map labels). The full name is shown everywhere else.
export const SPOT_SHORT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  gym: 'Sparta Gym', library: 'Einstein Library', lounge: 'Student Lounge',
  'pb-gym': 'Leviste Gym', 'pb-library': 'Main Library', 'mv-gym': 'Gymnasium',
})

export const DEFAULT_CAMPUS: Campus = campuses[DEFAULT_CAMPUS_ID]

export const getCampus = (id: CampusId): Campus => campuses[id]

export const isCampusId = (v: unknown): v is CampusId => typeof v === 'string' && Object.hasOwn(campuses, v)

// How safe-spot capacity is estimated when no official figure for waiting (not event seating) exists:
// usable floor area ÷ 2 m² per person, rounded down to 10. Usable share: 0.75 of a gym or hall floor, 0.6 of a
// library (shelves and desks). 2 m² is room to sit with a bag for a few hours: more than assembly seating
// (about 0.65 m²), less than the 3.5 m² Sphere standard for overnight shelter. Sources per spot are noted in
// each campus file.
export const SPOT_CAPACITY_RULE = { m2PerPerson: 2, usableShare: { hall: 0.75, library: 0.6 } } as const
