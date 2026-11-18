// Pure geospatial helpers shared by the app and the developer-only route generator
// (scripts/build-routes.mjs). Plain ES module JavaScript on purpose: the generator runs with plain
// `node` on any version >= 18, without a TypeScript loader. Types live in ./geo.d.ts.
//
// Coordinate order: BIYAHE's LatLng is [lat, lng]. OSRM / GeoJSON coordinates are [lon, lat].
// osrmToLatLng is the only place that order is flipped.

const EARTH_RADIUS_M = 6_371_008.8
const rad = (d) => (d * Math.PI) / 180

// Convert one OSRM / GeoJSON position [lon, lat] (extra elements such as altitude are ignored)
// into a BIYAHE LatLng [lat, lng]. Throws on anything that is not an array of two numbers.
export function osrmToLatLng(position) {
  if (!Array.isArray(position) || position.length < 2) {
    throw new TypeError(`Expected a GeoJSON [lon, lat] position, got ${JSON.stringify(position)}`)
  }
  const [lon, lat] = position
  if (typeof lon !== 'number' || typeof lat !== 'number') {
    throw new TypeError(`Expected numeric [lon, lat], got ${JSON.stringify(position)}`)
  }
  return [lat, lon]
}

// A well-formed [lat, lng]: two finite numbers within the WGS84 ranges.
export function isValidLatLng(p) {
  return Array.isArray(p) && p.length === 2
    && Number.isFinite(p[0]) && Number.isFinite(p[1])
    && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180
}

// Rough rectangle around BatStateU Alangilan and the directions its corridors leave in
// (Batangas City, Bauan, San Jose / Ibaan, Lipa, Tanauan), with margin.
//
// LIMITATIONS: this is a sanity check, not a boundary. It is not the Batangas provincial border or
// any administrative area; it includes sea and parts of neighbouring municipalities. Passing it says
// nothing about whether a point lies on a road. Its job is to catch garbage and swapped coordinates:
// the latitude and longitude ranges do not overlap, so a [lon, lat] pair always fails.
export const ALANGILAN_ROUTING_BOUNDS = Object.freeze({ minLat: 13.65, maxLat: 14.15, minLng: 120.9, maxLng: 121.3 })

export function withinAlangilanRoutingBounds(p) {
  const b = ALANGILAN_ROUTING_BOUNDS
  return isValidLatLng(p) && p[0] >= b.minLat && p[0] <= b.maxLat && p[1] >= b.minLng && p[1] <= b.maxLng
}

// Great-circle distance in metres.
export function haversineM(a, b) {
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function pathLengthM(path) {
  let total = 0
  for (let i = 1; i < path.length; i++) total += haversineM(path[i - 1], path[i])
  return total
}

// Longest single segment. 0 for paths with fewer than two points.
export function maxSegmentM(path) {
  let max = 0
  for (let i = 1; i < path.length; i++) max = Math.max(max, haversineM(path[i - 1], path[i]))
  return max
}

// Douglas–Peucker simplification with a tolerance in metres. Points are projected onto a local
// equirectangular plane (accurate to well under 1% over a few tens of km). Endpoints are always
// kept; the input is not modified.
export function simplify(path, toleranceM) {
  if (path.length <= 2) return path.slice()
  const lat0 = rad(path[0][0])
  const xy = path.map(([lat, lng]) => [rad(lng) * Math.cos(lat0) * EARTH_RADIUS_M, rad(lat) * EARTH_RADIUS_M])
  const keep = new Uint8Array(path.length)
  keep[0] = 1
  keep[path.length - 1] = 1
  const stack = [[0, path.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop()
    let maxD = 0
    let index = -1
    for (let i = first + 1; i < last; i++) {
      const d = pointSegmentDistance(xy[i], xy[first], xy[last])
      if (d > maxD) { maxD = d; index = i }
    }
    if (index !== -1 && maxD > toleranceM) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  return path.filter((_, i) => keep[i])
}

function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

// Round both values to `decimals` places (5 places is about 1.1 m).
export function roundLatLng(p, decimals = 5) {
  const f = 10 ** decimals
  return [Math.round(p[0] * f) / f, Math.round(p[1] * f) / f]
}

// Drop consecutive duplicate points (e.g. created by rounding).
export function dedupeConsecutive(path) {
  return path.filter((p, i) => i === 0 || p[0] !== path[i - 1][0] || p[1] !== path[i - 1][1])
}
