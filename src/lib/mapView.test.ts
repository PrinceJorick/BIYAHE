// Map presentation rules (src/lib/mapView.ts): distance-based fitting, zoom limits, attribution, the
// external directions link, walking-time wording and the development road-data warning.
import { describe, expect, it } from 'vitest'
import { alangilanRoadStatus } from '../campuses/alangilan'
import { CAMPUS, corridorById, corridors, fixture } from '../data'
import type { Corridor, LatLng } from '../types'
import { haversineM, pathLengthM } from './geo'
import {
  devRoadDataWarning, FIT_MAX_ZOOM, FIT_PADDING_PX, fitCamera, fitKey, googleMapsDirectionsUrl, mapFitPoints, MAX_ZOOM,
  MIN_ZOOM, NEARBY_ROUTE_M, OSM_ATTRIBUTION, pathPrefix, walkEstimate, type FitCamera, type FitPadding, type MapFitInput,
} from './mapView'

const NOW = Date.UTC(2026, 10, 16, 7, 0)
const input = (corridorId: string, kind: 'clear' | 'disrupted' = 'disrupted'): MapFitInput => ({
  campus: CAMPUS, corridors, corridor: corridorById(corridorId), spots: fixture(kind, NOW).spots,
})
const box = (pts: readonly LatLng[]) => ({
  minLat: Math.min(...pts.map((p) => p[0])), maxLat: Math.max(...pts.map((p) => p[0])),
  minLng: Math.min(...pts.map((p) => p[1])), maxLng: Math.max(...pts.map((p) => p[1])),
})
const contains = (b: ReturnType<typeof box>, p: LatLng) => p[0] >= b.minLat && p[0] <= b.maxLat && p[1] >= b.minLng && p[1] <= b.maxLng

// The zoom Leaflet's fitBounds picks for a box in a map of `w`×`h` px (Web Mercator, 256-px tiles, whole
// zoom levels, fixed pixel padding, capped at FIT_MAX_ZOOM). Used to check the fitted views are sensible.
function fitZoom(pts: readonly LatLng[], w: number, h: number) {
  const b = box(pts)
  const x = (lng: number) => (lng + 180) / 360
  const y = (lat: number) => { const s = Math.sin((lat * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) }
  const dx = x(b.maxLng) - x(b.minLng)
  const dy = y(b.minLat) - y(b.maxLat)
  const avail = (n: number) => n - 2 * FIT_PADDING_PX
  const z = Math.floor(Math.min(Math.log2(avail(w) / (256 * Math.max(dx, 1e-12))), Math.log2(avail(h) / (256 * Math.max(dy, 1e-12)))))
  return Math.min(z, FIT_MAX_ZOOM)
}
const PHONE = [360, 300] as const  // narrow "Where to wait" map
const PANE = [520, 700] as const   // wide side pane
const COORD = [700, 420] as const  // coordinator map

describe('zoom limits', () => {
  it('are fixed: users can zoom from the regional view (9) to street level (18); fitting stops at 16', () => {
    expect({ MIN_ZOOM, MAX_ZOOM, FIT_MAX_ZOOM }).toEqual({ MIN_ZOOM: 9, MAX_ZOOM: 18, FIT_MAX_ZOOM: 16 })
    expect(MIN_ZOOM).toBeLessThan(FIT_MAX_ZOOM)
    expect(FIT_MAX_ZOOM).toBeLessThanOrEqual(MAX_ZOOM)
  })

  it('every fitted view stays inside the zoom limits, so no feature is cut off by the minimum zoom', () => {
    for (const c of corridors) {
      for (const [w, h] of [PHONE, PANE]) {
        for (const extent of ['route', 'nearby'] as const) {
          const z = fitZoom(mapFitPoints('student', extent, input(c.id)), w, h)
          expect(z, `${c.id} ${extent} ${w}x${h}`).toBeGreaterThanOrEqual(MIN_ZOOM)
          expect(z).toBeLessThanOrEqual(FIT_MAX_ZOOM)
        }
      }
    }
    for (const [w, h] of [PHONE, COORD]) {
      const z = fitZoom(mapFitPoints('staff', 'route', input('lipa')), w, h)
      expect(z).toBeGreaterThanOrEqual(MIN_ZOOM)
    }
  })

  it('features close together are not over-zoomed (the cap applies)', () => {
    const tiny: LatLng[] = [CAMPUS, [13.7843, 121.0745]]
    expect(fitZoom(tiny, ...PHONE)).toBe(FIT_MAX_ZOOM)
  })
})

describe('pathPrefix (distance along the path)', () => {
  const straight: LatLng[] = [[13.7842, 121.0744], [13.7932, 121.0744], [13.8022, 121.0744]] // ~1 km segments

  it('cuts at the requested distance along the path, interpolating the last point', () => {
    const p = pathPrefix(straight, 1500)
    expect(p).toHaveLength(3)
    expect(pathLengthM(p)).toBeCloseTo(1500, 0)
    expect(p.slice(0, 2)).toEqual(straight.slice(0, 2))
  })

  it('returns the whole path when it is shorter than the limit, and handles empty or single-point paths', () => {
    expect(pathPrefix(straight, 10_000)).toEqual(straight)
    expect(pathPrefix([], 100)).toEqual([])
    expect(pathPrefix([CAMPUS], 100)).toEqual([CAMPUS])
  })

  it('covers the same distance for a dense road path as for a sparse hand-drawn one', () => {
    const dense: LatLng[] = Array.from({ length: 201 }, (_, k) => [13.7842 + (0.018 * k) / 200, 121.0744])
    expect(pathLengthM(pathPrefix(dense, NEARBY_ROUTE_M))).toBeCloseTo(NEARBY_ROUTE_M, 0)
    expect(pathLengthM(pathPrefix(straight, NEARBY_ROUTE_M))).toBeCloseTo(NEARBY_ROUTE_M, 0)
  })
})

describe('mapFitPoints: fit what is displayed', () => {
  it('staff: campus, every safe spot and every point of every corridor', () => {
    const i = input('lipa')
    const pts = mapFitPoints('staff', 'route', i)
    const b = box(pts)
    for (const c of corridors) for (const p of c.path) expect(contains(b, p)).toBe(true)
    for (const s of i.spots) expect(contains(b, s.pos)).toBe(true)
    expect(contains(b, CAMPUS)).toBe(true)
    // The extent ignores which corridor the student picked.
    expect(mapFitPoints('staff', 'route', input('tanauan'))).toEqual(pts)
  })

  it('student, route extent (side pane): the whole own corridor, campus and every safe spot', () => {
    for (const c of corridors) {
      const i = input(c.id)
      const b = box(mapFitPoints('student', 'route', i))
      for (const p of [...c.path, CAMPUS, ...i.spots.map((x) => x.pos)]) expect(contains(b, p)).toBe(true)
    }
  })

  it('student, nearby extent ("Where to wait"): campus, safe spots and the first kilometre of the route only', () => {
    for (const c of corridors) {
      const i = input(c.id)
      const pts = mapFitPoints('student', 'nearby', i)
      const b = box(pts)
      for (const p of [CAMPUS, ...i.spots.map((x) => x.pos)]) expect(contains(b, p)).toBe(true)
      // Nothing beyond ~1 km of route (plus the spots, which are within a few hundred metres of campus).
      for (const p of pts) expect(haversineM(CAMPUS, p)).toBeLessThanOrEqual(NEARBY_ROUTE_M + 1)
      // The far end of the corridor is not included, so the spots stay legible.
      expect(contains(b, c.path[c.path.length - 1])).toBe(false)
    }
  })

  it('the nearby extent is tighter than the route extent and zooms in further on a phone', () => {
    for (const c of corridors) {
      const near = fitZoom(mapFitPoints('student', 'nearby', input(c.id)), ...PHONE)
      const route = fitZoom(mapFitPoints('student', 'route', input(c.id)), ...PHONE)
      expect(near, c.id).toBeGreaterThan(route)
    }
  })

  it('the coordinator view is wider than any single student route', () => {
    const staff = box(mapFitPoints('staff', 'route', input('lipa')))
    for (const c of corridors) {
      const own = box(mapFitPoints('student', 'route', input(c.id)))
      expect(staff.minLat <= own.minLat && staff.maxLat >= own.maxLat && staff.minLng <= own.minLng && staff.maxLng >= own.maxLng).toBe(true)
    }
  })

  it('a dense road path is fitted in full (route extent), not just its first few points', () => {
    const dense: Corridor = { ...corridors[0], path: Array.from({ length: 50 }, (_, k): LatLng => [13.7842 + k * 0.001, 121.0744]) }
    const i: MapFitInput = { campus: CAMPUS, corridors: [dense], corridor: dense, spots: [] }
    expect(contains(box(mapFitPoints('student', 'route', i)), dense.path[49])).toBe(true)
    expect(contains(box(mapFitPoints('staff', 'route', i)), dense.path[49])).toBe(true)
  })
})

describe('fitKey', () => {
  it('is equal for equal point lists and differs when any point changes', () => {
    const a: LatLng[] = [[13.7842, 121.0744], [13.7875, 121.0705]]
    expect(fitKey(a)).toBe(fitKey(structuredClone(a)))
    expect(fitKey(a)).not.toBe(fitKey([[13.7842, 121.0744], [13.7875, 121.0706]]))
    expect(fitKey(a)).not.toBe(fitKey(a.slice(0, 1)))
  })
})

describe('fitCamera (the Google map camera, set in one step)', () => {
  // Independent Web Mercator projection: where a point lands on screen for a camera, in px from the map's top left.
  const mx = (lng: number) => (lng + 180) / 360
  const my = (lat: number) => { const s = Math.sin((lat * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) }
  const screen = (cam: FitCamera, size: { width: number; height: number }, [lat, lng]: LatLng) => {
    const world = 256 * 2 ** cam.zoom
    let dx = mx(lng) - mx(cam.center[1])
    if (dx > 0.5) dx -= 1
    if (dx < -0.5) dx += 1
    return [size.width / 2 + dx * world, size.height / 2 + (my(lat) - my(cam.center[0])) * world]
  }
  // Every point inside the clear area (0.5 px tolerance for float error).
  const expectInside = (pts: readonly LatLng[], cam: FitCamera, size: { width: number; height: number }, pad: FitPadding) => {
    for (const p of pts) {
      const [x, y] = screen(cam, size, p)
      expect(x, `x of ${p}`).toBeGreaterThanOrEqual(pad.left - 0.5)
      expect(x, `x of ${p}`).toBeLessThanOrEqual(size.width - pad.right + 0.5)
      expect(y, `y of ${p}`).toBeGreaterThanOrEqual(pad.top - 0.5)
      expect(y, `y of ${p}`).toBeLessThanOrEqual(size.height - pad.bottom + 0.5)
    }
  }
  // The points' box, on screen.
  const screenBox = (pts: readonly LatLng[], cam: FitCamera, size: { width: number; height: number }) => {
    const s = pts.map((p) => screen(cam, size, p))
    const xs = s.map(([x]) => x), ys = s.map(([, y]) => y)
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
  }
  const centreOf = (b: { left: number; right: number; top: number; bottom: number }) => [(b.left + b.right) / 2, (b.top + b.bottom) / 2]

  const EVEN: FitPadding = { top: 48, right: 48, bottom: 40, left: 40 }  // MapView's default (the Destination map)
  const ZERO: FitPadding = { top: 0, right: 0, bottom: 0, left: 0 }
  const WIDE = { width: 1440, height: 900 }
  const WIDE_OPEN: FitPadding = { top: 80, right: 72, bottom: 48, left: 440 }  // Map screen, wide, panel open
  const WIDE_SHUT: FitPadding = { top: 80, right: 72, bottom: 48, left: 96 }
  const PHONE_MAP = { width: 390, height: 780 }
  const PHONE_OPEN: FitPadding = { top: Math.round(844 * 0.55) + 16, right: 56, bottom: 88, left: 24 }  // panel open
  const PHONE_SHUT: FitPadding = { top: 112, right: 56, bottom: 88, left: 24 }
  const routePts = (id: string) => mapFitPoints('student', 'route', input(id))
  // A safe spot about 300 m from campus, as the Map screen fits it: campus + spot.
  const spotPts: LatLng[] = [CAMPUS, [CAMPUS[0] + 0.0027, CAMPUS[1] + 0.0002]]

  it('symmetrical padding: the points are centred on the map', () => {
    const pad = { top: 40, right: 40, bottom: 40, left: 40 }
    const size = { width: 600, height: 400 }
    const pts = routePts(corridors[0].id)
    const cam = fitCamera(pts, size, pad)!
    expectInside(pts, cam, size, pad)
    const [cx, cy] = centreOf(screenBox(pts, cam, size))
    expect(cx).toBeCloseTo(300, 6)
    expect(cy).toBeCloseTo(200, 6)
  })

  it('uneven left/right padding moves the centre so the points sit in the clear area, not under the panel', () => {
    for (const c of corridors) {
      const pts = routePts(c.id)
      for (const pad of [WIDE_OPEN, WIDE_SHUT]) {
        const cam = fitCamera(pts, WIDE, pad)!
        expectInside(pts, cam, WIDE, pad)
        const [cx] = centreOf(screenBox(pts, cam, WIDE))
        expect(cx, c.id).toBeCloseTo((pad.left + WIDE.width - pad.right) / 2, 6)
      }
      // Opening the panel shifts the map's centre west (the points move right, clear of the panel).
      const open = fitCamera(pts, WIDE, WIDE_OPEN)!, shut = fitCamera(pts, WIDE, WIDE_SHUT)!
      if (open.zoom === shut.zoom) expect(open.center[1]).toBeLessThan(shut.center[1])
    }
  })

  it('uneven top/bottom padding (phone, panel open over the top 55%) keeps the points below the panel', () => {
    for (const c of corridors) {
      const pts = routePts(c.id)
      for (const pad of [PHONE_OPEN, PHONE_SHUT]) {
        const cam = fitCamera(pts, PHONE_MAP, pad)!
        expectInside(pts, cam, PHONE_MAP, pad)
        const [, cy] = centreOf(screenBox(pts, cam, PHONE_MAP))
        expect(cy, c.id).toBeCloseTo((pad.top + PHONE_MAP.height - pad.bottom) / 2, 6)
      }
    }
  })

  it('small bounds (a nearby safe spot) stop at FIT_MAX_ZOOM, still inside the clear area', () => {
    for (const [size, pad] of [[WIDE, WIDE_OPEN], [PHONE_MAP, PHONE_OPEN], [PHONE_MAP, PHONE_SHUT], [{ width: 360, height: 300 }, EVEN]] as const) {
      const cam = fitCamera(spotPts, size, pad)!
      expect(cam.zoom).toBe(FIT_MAX_ZOOM)
      expectInside(spotPts, cam, size, pad)
    }
    // Without the cap the same fit would zoom in past it (the overshoot fitBounds animated through).
    expect(fitCamera(spotPts, WIDE, WIDE_SHUT, MIN_ZOOM, 30)!.zoom).toBeGreaterThan(FIT_MAX_ZOOM)
  })

  it('large bounds (whole routes): the largest whole zoom that fits, within the zoom limits', () => {
    for (const c of corridors) {
      const pts = routePts(c.id)
      for (const [size, pad] of [[WIDE, WIDE_OPEN], [PHONE_MAP, PHONE_SHUT], [{ width: 360, height: 300 }, EVEN]] as const) {
        const cam = fitCamera(pts, size, pad)!
        expect(cam.zoom).toBeGreaterThanOrEqual(MIN_ZOOM)
        expect(cam.zoom).toBeLessThanOrEqual(FIT_MAX_ZOOM)
        expect(Number.isInteger(cam.zoom)).toBe(true)
        expectInside(pts, cam, size, pad)
        // One zoom level more would not fit (unless the cap already stopped it).
        if (cam.zoom < FIT_MAX_ZOOM) {
          const b = screenBox(pts, cam, size)
          const tooBig = 2 * (b.right - b.left) > size.width - pad.left - pad.right + 1e-6
            || 2 * (b.bottom - b.top) > size.height - pad.top - pad.bottom + 1e-6
          expect(tooBig, `${c.id} ${size.width}x${size.height}`).toBe(true)
        }
      }
    }
  })

  it('picks the same zoom as the Leaflet-style fit the simple map uses', () => {
    const pad = { top: FIT_PADDING_PX, right: FIT_PADDING_PX, bottom: FIT_PADDING_PX, left: FIT_PADDING_PX }
    for (const c of corridors) {
      for (const [w, h] of [PANE, COORD]) {
        const pts = routePts(c.id)
        expect(fitCamera(pts, { width: w, height: h }, pad)!.zoom, c.id).toBe(Math.max(MIN_ZOOM, fitZoom(pts, w, h)))
      }
    }
  })

  it('enforces the zoom limits it is given', () => {
    expect(fitCamera(spotPts, WIDE, ZERO)!.zoom).toBe(FIT_MAX_ZOOM)
    expect(fitCamera(spotPts, WIDE, ZERO, MIN_ZOOM, 12)!.zoom).toBe(12)
    // A box too big for the minimum zoom stays at the minimum (as Google's minZoom would).
    expect(fitCamera([[-40, -100], [60, 100]], { width: 300, height: 300 }, ZERO)!.zoom).toBe(MIN_ZOOM)
  })

  it('a single point (or points all in one place) is centred in the clear area at FIT_MAX_ZOOM', () => {
    for (const pts of [[CAMPUS], [CAMPUS, CAMPUS]] as LatLng[][]) {
      const cam = fitCamera(pts, PHONE_MAP, PHONE_OPEN)!
      expect(cam.zoom).toBe(FIT_MAX_ZOOM)
      const [x, y] = screen(cam, PHONE_MAP, CAMPUS)
      expect(x).toBeCloseTo((PHONE_OPEN.left + PHONE_MAP.width - PHONE_OPEN.right) / 2, 6)
      expect(y).toBeCloseTo((PHONE_OPEN.top + PHONE_MAP.height - PHONE_OPEN.bottom) / 2, 6)
    }
    const even = fitCamera([CAMPUS], WIDE, ZERO)!
    expect(even.center[0]).toBeCloseTo(CAMPUS[0], 9)
    expect(even.center[1]).toBeCloseTo(CAMPUS[1], 9)
  })

  it('takes the short way across the antimeridian', () => {
    const pts: LatLng[] = [[10, 179.9], [10.1, -179.9]]
    const cam = fitCamera(pts, { width: 600, height: 400 }, ZERO)!
    expect(cam.zoom).toBeGreaterThan(MIN_ZOOM)
    expect(Math.abs(cam.center[1])).toBeGreaterThan(179.9)
    expectInside(pts, cam, { width: 600, height: 400 }, ZERO)
  })

  it('returns null (camera left as it is) for an empty or zero-sized map, nothing to fit, or padding that fills the map', () => {
    expect(fitCamera(spotPts, { width: 0, height: 400 }, ZERO)).toBeNull()
    expect(fitCamera(spotPts, { width: 400, height: 0 }, ZERO)).toBeNull()
    expect(fitCamera(spotPts, { width: Number.NaN, height: 400 }, ZERO)).toBeNull()
    expect(fitCamera([], WIDE, ZERO)).toBeNull()
    expect(fitCamera([[Number.NaN, 121], [13, Number.POSITIVE_INFINITY], [95, 0], [0, 190]], WIDE, ZERO)).toBeNull()
    expect(fitCamera(spotPts, { width: 400, height: 300 }, { top: 200, right: 0, bottom: 100, left: 0 })).toBeNull()
    expect(fitCamera(spotPts, { width: 400, height: 300 }, { top: 0, right: 250, bottom: 0, left: 250 })).toBeNull()
  })

  it('ignores invalid points and treats negative or non-numeric padding as none', () => {
    const withBad: LatLng[] = [...spotPts, [Number.NaN, 0], [0, 400]]
    expect(fitCamera(withBad, WIDE, WIDE_OPEN)).toEqual(fitCamera(spotPts, WIDE, WIDE_OPEN))
    const odd = { top: -20, right: Number.NaN, bottom: 0, left: Number.POSITIVE_INFINITY }
    // Infinity is not a usable size either, so it counts as no padding too.
    expect(fitCamera(spotPts, WIDE, odd)).toEqual(fitCamera(spotPts, WIDE, ZERO))
  })
})

describe('OpenStreetMap attribution', () => {
  it('has the exact credit text and copyright link', () => {
    expect(OSM_ATTRIBUTION).toEqual({ text: '© OpenStreetMap contributors · ODbL', href: 'https://www.openstreetmap.org/copyright' })
  })
})

describe('Google Maps directions link', () => {
  it('uses the spot coordinates in [lat, lng] order, as a walking-directions universal URL', () => {
    for (const s of fixture('disrupted', NOW).spots) {
      const url = new URL(googleMapsDirectionsUrl(s.pos))
      expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/')
      expect(url.searchParams.get('api')).toBe('1')
      expect(url.searchParams.get('destination')).toBe(`${s.pos[0]},${s.pos[1]}`)
      expect(url.searchParams.get('travelmode')).toBe('walking')
    }
    expect(googleMapsDirectionsUrl([13.7849, 121.0745])).toBe('https://www.google.com/maps/dir/?api=1&destination=13.7849%2C121.0745&travelmode=walking')
  })

  it('rejects invalid or swapped coordinates', () => {
    expect(() => googleMapsDirectionsUrl([121.0745, 13.7849])).toThrow(RangeError)
    expect(() => googleMapsDirectionsUrl([Number.NaN, 121])).toThrow(RangeError)
  })
})

describe('walking-time wording', () => {
  it('states the configured minutes as an estimate; the value itself is unchanged', () => {
    expect(walkEstimate(3)).toBe('about 3 min walk (estimate)')
    for (const s of fixture('clear', NOW).spots) expect(walkEstimate(s.walkMin)).toBe(`about ${s.walkMin} min walk (estimate)`)
  })
})

describe('development road-data warning', () => {
  const rejected = { supplied: true, active: false, problems: ['lipa: routeGeometrySha256 does not match the path'] }

  it('appears only in development, only when supplied road data was rejected', () => {
    expect(devRoadDataWarning(rejected, true)).toBe('Reviewed road data invalid — showing hand-drawn routes (development warning; 1 problem, see console)')
    expect(devRoadDataWarning({ ...rejected, problems: ['a', 'b'] }, true)).toMatch(/2 problems/)
  })

  it('never appears in production, when no data was supplied, or when the data is in use', () => {
    expect(devRoadDataWarning(rejected, false)).toBeNull()
    expect(devRoadDataWarning({ supplied: false, active: false, problems: [] }, true)).toBeNull()
    expect(devRoadDataWarning({ supplied: true, active: true, problems: [] }, true)).toBeNull()
  })

  it('does not show validation details or claim success', () => {
    const w = devRoadDataWarning(rejected, true)!
    expect(w).not.toContain('routeGeometrySha256')
    expect(w).not.toMatch(/approved|verified|valid road/i)
  })

  it('today: no road data is supplied, so no warning', () => {
    expect(alangilanRoadStatus).toEqual({ supplied: false, active: false, problems: [] })
    expect(devRoadDataWarning(alangilanRoadStatus, true)).toBeNull()
  })
})
