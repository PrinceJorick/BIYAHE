// Stage 0 characterization tests: they pin down how a student's view is derived today at
// Alangilan, so the multi-campus work can be checked against it. They describe current
// behavior; they are not a specification.
import { describe, expect, it } from 'vitest'
import {
  corridorById, corridors, corridorStateFor, fallbackWeather, fixture,
  type Advisory, type CorridorStatus, type Snapshot, type Spot,
} from '../data'
import { concernsStudent, shareMessage, STALE_AFTER_MIN, studentView } from './derive'
import { defaultAlertPrefs, type State } from './store'

const MIN = 60_000
const NOW = Date.UTC(2026, 10, 16, 7, 0)

// A complete State for a student on a given corridor. Every value is fixed; nothing reads the real clock.
function makeState(overrides: Partial<State> = {}): State {
  return {
    ready: true,
    role: 'student',
    staffRole: 'DRRMO Coordinator',
    corridorId: 'lipa',
    scenario: 'disrupted',
    lowBattery: false,
    batteryHint: false,
    online: true,
    backend: 'device',
    snapshot: fixture('disrupted', NOW),
    savedAt: NOW,
    weather: fallbackWeather(NOW),
    weatherError: null,
    newsRead: [],
    alertPrefs: defaultAlertPrefs,
    lastSync: null,
    syncing: false,
    spotId: null,
    walk: null,
    walkLoading: null,
    traffic: null,
    trafficError: null,
    departures: {},
    news: null,
    toast: null,
    ...overrides,
  }
}

const withCorridor = (base: Snapshot, id: string, status: CorridorStatus): Snapshot => ({
  ...base,
  corridors: { ...base.corridors, [id]: corridorStateFor(corridorById(id), status) },
})

describe('studentView decisions', () => {
  const statuses: CorridorStatus[] = ['open', 'slow', 'closed']
  const cases = corridors.flatMap((c) => statuses.map((status) => [c.id, status] as const))

  it.each(cases)('%s / %s', (id, status) => {
    const snapshot = withCorridor(fixture('clear', NOW), id, status)
    const v = studentView(makeState({ corridorId: id, snapshot }), NOW)
    expect(v.corridor.id).toBe(id)
    expect(v.cs).toEqual(snapshot.corridors[id])
    expect(v.decision).toBe(status === 'closed' ? 'wait' : 'go')
    expect(v.provenance).toBe(status === 'open' ? 'official' : 'estimate')
  })

  it('in the disrupted fixture, the routes through the flood (Lipa, Tanauan) say wait', () => {
    const decisions = Object.fromEntries(
      corridors.map((c) => [c.id, studentView(makeState({ corridorId: c.id }), NOW).decision]),
    )
    expect(decisions).toEqual({ lipa: 'wait', batangas: 'go', bauan: 'go', sanjose: 'go', tanauan: 'wait', rosario: 'go' })
  })
})

describe('studentView freshness', () => {
  it('a fresh online view keeps the corridor provenance', () => {
    const v = studentView(makeState({ snapshot: fixture('clear', NOW), corridorId: 'batangas' }), NOW)
    expect(v).toMatchObject({ offline: false, stale: false, ageMin: 2, provenance: 'official' })
  })

  it.each([
    ['browser offline', { online: false }],
    ['offline scenario', { scenario: 'offline' }],
  ] as const)('%s: marks the view saved without changing the decision', (_label, overrides) => {
    const v = studentView(makeState(overrides), NOW)
    expect(v.offline).toBe(true)
    expect(v.provenance).toBe('saved')
    expect(v.decision).toBe('wait')
  })

  it(`is stale only after more than ${STALE_AFTER_MIN} minutes`, () => {
    const aged = (min: number) => makeState({ snapshot: { ...fixture('disrupted', NOW), updatedAt: NOW - min * MIN } })

    const atLimit = studentView(aged(30), NOW)
    expect(atLimit).toMatchObject({ ageMin: 30, stale: false, provenance: 'estimate' })

    const over = studentView(aged(31), NOW)
    expect(over).toMatchObject({ ageMin: 31, stale: true, provenance: 'saved', decision: 'wait' })
  })

  it('clamps a future timestamp to an age of zero', () => {
    const v = studentView(makeState({ snapshot: { ...fixture('clear', NOW), updatedAt: NOW + 5 * MIN } }), NOW)
    expect(v.ageMin).toBe(0)
    expect(v.stale).toBe(false)
  })
})

describe('studentView safe spot', () => {
  it('defaults to the nearest spot with room', () => {
    expect(studentView(makeState(), NOW).spot?.id).toBe('gym')
    expect(studentView(makeState({ snapshot: fixture('clear', NOW) }), NOW).spot?.id).toBe('gym')
  })

  it('honors a chosen spot that has room', () => {
    expect(studentView(makeState({ snapshot: fixture('clear', NOW), spotId: 'library' }), NOW).spot?.id).toBe('library')
  })

  it('falls back to the nearest spot with room when the chosen one is full', () => {
    // Library is at 250/250 in the disrupted fixture.
    expect(studentView(makeState({ spotId: 'library' }), NOW).spot?.id).toBe('gym')
  })

  it('has no spot when every spot is full', () => {
    const base = fixture('disrupted', NOW)
    const spots = base.spots.filter((s) => s.capacity != null).map((s) => ({ ...s, occupied: s.capacity! }))
    expect(studentView(makeState({ snapshot: { ...base, spots } }), NOW).spot).toBeUndefined()
  })

  it('never treats a spot with unassessed capacity as full, and prefers known space on equal walks', () => {
    const base = fixture('disrupted', NOW)
    const known = base.spots.map((s) => (s.capacity == null ? s : { ...s, occupied: s.capacity }))
    expect(studentView(makeState({ snapshot: { ...base, spots: known } }), NOW).spot?.id).toBe('lounge')
    // With the gym open, the gym (known space) comes before the lounge at the same walking estimate.
    expect(studentView(makeState(), NOW).spot?.id).toBe('gym')
  })
})

// LEGACY BEHAVIOR, scheduled for replacement in Stage 3 (multi-campus).
// This records what the app does today; it is not a requirement. Stage 3 changes how a
// missing or unknown corridor is handled, and this block will be rewritten or removed then.
describe('LEGACY (scheduled for replacement in Stage 3): invalid/missing corridor falls back to Lipa', () => {
  it('a missing corridor id resolves to Lipa', () => {
    const v = studentView(makeState({ corridorId: null }), NOW)
    expect(v.corridor.id).toBe('lipa')
    expect(v.decision).toBe('wait')
  })

  it('an unknown corridor id resolves to Lipa', () => {
    expect(studentView(makeState({ corridorId: 'not-a-corridor' }), NOW).corridor.id).toBe('lipa')
  })
})

describe('concernsStudent', () => {
  const advisory = (scope: string): Advisory => ({
    id: `test-${scope}`, source: 'Campus', issuer: 'Campus DRRMO', title: 't', body: 'b',
    severity: 'info', scope, issuedAt: NOW,
  })

  it("'all' and 'campus' advisories concern every student, with or without a corridor", () => {
    for (const scope of ['all', 'campus']) {
      expect(concernsStudent(advisory(scope), 'lipa')).toBe(true)
      expect(concernsStudent(advisory(scope), 'bauan')).toBe(true)
      expect(concernsStudent(advisory(scope), null)).toBe(true)
    }
  })

  it('a corridor advisory concerns only students on that corridor', () => {
    expect(concernsStudent(advisory('lipa'), 'lipa')).toBe(true)
    expect(concernsStudent(advisory('lipa'), 'batangas')).toBe(false)
    expect(concernsStudent(advisory('lipa'), null)).toBe(false)
  })

  it('filters the disrupted advisories per corridor', () => {
    const { advisories } = fixture('disrupted', NOW)
    const seen = (id: string) => advisories.filter((a) => concernsStudent(a, id)).map((a) => a.id)
    expect(seen('lipa')).toEqual(['lgu-flood-lipa', 'pagasa-RA-07', 'campus-suspend'])
    expect(seen('batangas')).toEqual(['pagasa-RA-07', 'campus-suspend'])
    expect(seen('bauan')).toEqual(['pagasa-RA-07', 'campus-suspend'])
  })
})

describe('shareMessage', () => {
  const view = (overrides: Partial<State> = {}) => studentView(makeState(overrides), NOW)
  const clear = fixture('clear', NOW)

  describe("'home'", () => {
    it('Lipa closed: hour-range travel time', () => {
      expect(shareMessage(view(), 'home')).toBe(
        "I'm heading home from BatStateU Alangilan via JP Laurel Hwy. Travel time looks like 2h 15m–3h 10m. I'll message you when I arrive.",
      )
    })

    it('equal low and high collapse to one value', () => {
      expect(shareMessage(view({ corridorId: 'batangas' }), 'home')).toBe(
        "I'm heading home from BatStateU Alangilan via P. Burgos. Travel time looks like 20 min. I'll message you when I arrive.",
      )
    })

    it('sub-hour range shares one unit', () => {
      expect(shareMessage(view({ corridorId: 'bauan', snapshot: clear }), 'home')).toBe(
        "I'm heading home from BatStateU Alangilan via Diversion Rd. Travel time looks like 30–40 min. I'll message you when I arrive.",
      )
    })

    it('a range reaching an hour formats both ends', () => {
      expect(shareMessage(view({ corridorId: 'tanauan', snapshot: clear }), 'home')).toBe(
        "I'm heading home from BatStateU Alangilan via STAR Tollway. Travel time looks like 1h–1h 10m. I'll message you when I arrive.",
      )
    })
  })

  describe("'campus'", () => {
    it('closed corridor, waiting at Sparta Gymnasium', () => {
      expect(shareMessage(view(), 'campus')).toBe(
        "I'm safe at BatStateU Alangilan. JP Laurel Hwy is closed right now, so I'm waiting at Sparta Gymnasium (power, water). I'll head home when the road clears.",
      )
    })

    it('slow corridor', () => {
      expect(shareMessage(view({ corridorId: 'bauan' }), 'campus')).toBe(
        "I'm safe at BatStateU Alangilan. Diversion Rd is slow right now, so I'm waiting at Sparta Gymnasium (power, water). I'll head home when the road clears.",
      )
    })

    it('open corridor, waiting at the Gymnasium', () => {
      expect(shareMessage(view({ corridorId: 'batangas', spotId: 'gym' }), 'campus')).toBe(
        "I'm safe at BatStateU Alangilan. I am staying on campus for now, so I'm waiting at Sparta Gymnasium (power, water). I'll head home when the road clears.",
      )
    })

    it('single amenity (Library)', () => {
      expect(shareMessage(view({ snapshot: clear, spotId: 'library' }), 'campus')).toBe(
        "I'm safe at BatStateU Alangilan. I am staying on campus for now, so I'm waiting at Einstein Bldg Library, 2nd Floor (power). I'll head home when the road clears.",
      )
    })

    it('a spot with no amenities has no parenthetical', () => {
      const v = view()
      const bare: Spot = { ...v.spot!, amenities: { power: false, water: false, food: false } }
      expect(shareMessage({ ...v, spot: bare }, 'campus')).toBe(
        "I'm safe at BatStateU Alangilan. JP Laurel Hwy is closed right now, so I'm waiting at Sparta Gymnasium. I'll head home when the road clears.",
      )
    })

    it('no spot available', () => {
      expect(shareMessage({ ...view(), spot: undefined }, 'campus')).toBe(
        "I'm safe at BatStateU Alangilan. JP Laurel Hwy is closed right now, so I am waiting on campus. I'll head home when the road clears.",
      )
    })
  })
})
