// Campus registry: the single home for campus reference data (location, corridors, safe spots).
// There is deliberately no mutable "active campus" here. Until campus selection exists,
// callers use DEFAULT_CAMPUS; a later stage passes a campus resolved from app state instead.
// Entries other than the default may be identity-only (empty corridors and spots). Those are
// not ready for student use and must not become the default or be reachable from the UI.
import type { Campus, CampusId } from '../types'
import { alangilan } from './alangilan'
import { malvar } from './malvar'
import { pabloBorbon } from './pabloBorbon'

export const campuses: Record<CampusId, Campus> = { alangilan, 'pablo-borbon': pabloBorbon, malvar }

export const DEFAULT_CAMPUS_ID: CampusId = 'alangilan'

export const DEFAULT_CAMPUS: Campus = campuses[DEFAULT_CAMPUS_ID]

export const getCampus = (id: CampusId): Campus => campuses[id]
