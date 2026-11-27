// Campus registry: the single home for campus reference data (location, corridors, safe spots).
// The campus in use is chosen by the student or staff member (see ./active.ts); DEFAULT_CAMPUS is the
// fallback when nothing has been chosen yet.
import type { Campus, CampusId } from '../types'
import { alangilan, ALANGILAN_FOOTPRINTS } from './alangilan'
import type { CapacitySource } from './capacity'
import { malvar } from './malvar'
import { pabloBorbon, PABLO_BORBON_FOOTPRINTS } from './pabloBorbon'

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

// Capacity rule and calculation: ./capacity.ts. Where each spot's capacity comes from (and whether it is verified).
export { SPOT_CAPACITY_RULE } from './capacity'
export const SPOT_CAPACITY_SOURCES: Readonly<Record<string, CapacitySource>> = { ...ALANGILAN_FOOTPRINTS, ...PABLO_BORBON_FOOTPRINTS }
