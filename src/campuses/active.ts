// The campus this device uses. Chosen once (student setup or staff access) and kept in localStorage, so the
// whole app reads campus data as plain constants. Changing campus saves the choice and reloads the page.
import type { Campus, CampusId } from '../types'
import { campuses, DEFAULT_CAMPUS_ID, isCampusId } from './index'

export const CAMPUS_KEY = 'biyahe-campus'

export function readCampusId(): CampusId {
  try {
    const v = localStorage.getItem(CAMPUS_KEY)
    if (isCampusId(v)) return v
  } catch {
    // storage blocked or not in a browser
  }
  return DEFAULT_CAMPUS_ID
}

export const ACTIVE_CAMPUS: Campus = campuses[readCampusId()]

/** Saves the campus and reloads at `hash` (e.g. '#/home'). Does nothing if it is already in use. */
export function switchCampus(id: CampusId, hash: string) {
  if (id === ACTIVE_CAMPUS.id) return false
  try {
    localStorage.setItem(CAMPUS_KEY, id)
  } catch {
    return false
  }
  location.hash = hash
  location.reload()
  return true
}

// Shared records (advisory IDs) of campuses other than the default carry this prefix, so campuses can share one
// Supabase project. The default campus keeps unprefixed IDs, as before campuses were selectable.
export const campusKeyPrefix = (id: CampusId) => (id === DEFAULT_CAMPUS_ID ? '' : `${id}:`)
