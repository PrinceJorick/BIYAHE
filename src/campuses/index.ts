// Campus registry: the single home for campus reference data (location, corridors, safe spots).
// There is deliberately no mutable "active campus" here. Until campus selection exists,
// callers use DEFAULT_CAMPUS; a later stage passes a campus resolved from app state instead.
import type { Campus, CampusId } from '../types'
import { alangilan } from './alangilan'

export const campuses: Record<CampusId, Campus> = { alangilan }

export const DEFAULT_CAMPUS_ID: CampusId = 'alangilan'

export const DEFAULT_CAMPUS: Campus = campuses[DEFAULT_CAMPUS_ID]

export const getCampus = (id: CampusId): Campus => campuses[id]
