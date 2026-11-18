// The campus in use, and how its records are kept apart from other campuses' in shared storage.
import { describe, expect, it } from 'vitest'
import { advisoryId, fixture, isCampusAdvisoryId } from '../data'
import { matchesCampus } from '../lib/store'
import { ACTIVE_CAMPUS, CAMPUS_KEY, campusKeyPrefix, readCampusId } from './active'

describe('active campus', () => {
  it('falls back to the default campus when nothing is stored (or storage is unavailable)', () => {
    expect(CAMPUS_KEY).toBe('biyahe-campus')
    expect(readCampusId()).toBe('alangilan')
    expect(ACTIVE_CAMPUS.id).toBe('alangilan')
  })

  it('prefixes shared record IDs for every campus except the default', () => {
    expect(campusKeyPrefix('alangilan')).toBe('')
    expect(campusKeyPrefix('pablo-borbon')).toBe('pablo-borbon:')
    expect(campusKeyPrefix('malvar')).toBe('malvar:')
  })

  it('keeps the default campus advisory IDs unprefixed and ignores other campuses’', () => {
    expect(advisoryId('campus-1')).toBe('campus-1')
    expect(isCampusAdvisoryId('campus-1')).toBe(true)
    expect(isCampusAdvisoryId('malvar:campus-1')).toBe(false)
  })

  it('accepts a saved snapshot only if it has this campus’s routes and safe spots', () => {
    const snap = fixture('clear')
    expect(matchesCampus(snap)).toBe(true)
    expect(matchesCampus({ ...snap, spots: [...snap.spots, { ...snap.spots[0], id: 'cics' }] })).toBe(false)
    const { lipa: _lipa, ...rest } = snap.corridors
    expect(matchesCampus({ ...snap, corridors: rest })).toBe(false)
  })
})
