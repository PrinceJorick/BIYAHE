// Route hashing shared by the developer-only route tools and the application (browser-safe).
// Pure functions only: no filesystem, no Node APIs, no network. routeChecks.js re-exports everything here,
// so the generator, the approval validator and the app all use this one implementation.
import { GEOMETRY_PROCESSING_VERSION } from './routeVersions.js'

// ── SHA-256 (pure, synchronous, dependency-free) ────────────────────────────

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const rotr = (x, n) => (x >>> n) | (x << (32 - n))

// SHA-256 of raw bytes, lowercase hex. Synchronous so the same function works in the generator, the
// approval script, tests and (if ever needed) the browser.
export function sha256Hex(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('sha256Hex expects a Uint8Array')
  const len = bytes.length
  const padded = new Uint8Array((((len + 8) >> 6) + 1) << 6)
  padded.set(bytes)
  padded[len] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, Math.floor(len / 0x20000000))
  dv.setUint32(padded.length - 4, (len << 3) >>> 0)
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, hh] = h
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + SHA256_K[i] + w[i]) >>> 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('')
}

const utf8 = (s) => new TextEncoder().encode(s)

// Diagnostic GeoJSON hash: the EXACT file bytes. No newline or encoding normalization; strings are
// rejected because converting text back to bytes could change them.
export function geojsonSha256(bytes) {
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes)
  if (!(bytes instanceof Uint8Array)) throw new TypeError('geojsonSha256 needs the exact file bytes (Uint8Array), not text')
  return sha256Hex(bytes)
}

// Committed record / evidence hash: UTF-8 bytes after CRLF → LF normalization. A byte-order mark, invalid
// UTF-8 or a lone CR is rejected rather than repaired.
export function recordSha256(content) {
  let text
  if (content instanceof Uint8Array) {
    if (content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf) throw new Error('Record starts with a UTF-8 byte-order mark')
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(content) } catch { throw new Error('Record is not valid UTF-8') }
  } else if (typeof content === 'string') {
    text = content
  } else {
    throw new TypeError('recordSha256 expects a string or Uint8Array')
  }
  if (text.charCodeAt(0) === 0xfeff) throw new Error('Record starts with a UTF-8 byte-order mark')
  const lf = text.replace(/\r\n/g, '\n')
  if (lf.includes('\r')) throw new Error('Record contains a carriage return that is not part of CRLF')
  return sha256Hex(utf8(lf))
}

// ── Application path serialization and hash ─────────────────────────────────

const LAT_LNG_DECIMALS = 5
const isFiveDp = (v) => Number(v.toFixed(LAT_LNG_DECIMALS)) === v
export const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1]

function assertAppPoint(p, i) {
  if (!Array.isArray(p) || p.length !== 2) throw new TypeError(`Point ${i} is not a [lat, lng] pair`)
  const [lat, lng] = p
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new RangeError(`Point ${i} has a non-finite coordinate`)
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new RangeError(`Point ${i} is outside latitude/longitude ranges`)
  if (!isFiveDp(lat) || !isFiveDp(lng)) throw new RangeError(`Point ${i} is not rounded to ${LAT_LNG_DECIMALS} decimals`)
}

const fmt = (v) => (Object.is(v, -0) ? 0 : v).toFixed(LAT_LNG_DECIMALS)

// The complete application path [campus, ...roadPath] serialized as
//   "gp-1|latlng|5|" + "lat,lng" pairs joined by ";"
// Rules: campus first (by value); [lat, lng] order; exactly 5 decimals (values must already be rounded —
// nothing is silently rounded); -0 written as 0.00000; no whitespace or trailing separator; the campus
// anchor appears once only.
export function serializeAppPath(appPath, campus) {
  if (!Array.isArray(appPath) || appPath.length < 2) throw new TypeError('An application path needs the campus point and at least one road point')
  assertAppPoint(campus, 'campus')
  appPath.forEach(assertAppPoint)
  if (!samePoint(appPath[0], campus)) throw new Error('The application path must start at the campus point')
  const repeat = appPath.findIndex((p, i) => i > 0 && samePoint(p, campus))
  if (repeat !== -1) throw new Error(`Duplicate campus anchor at point ${repeat}`)
  return `${GEOMETRY_PROCESSING_VERSION}|latlng|${LAT_LNG_DECIMALS}|${appPath.map(([lat, lng]) => `${fmt(lat)},${fmt(lng)}`).join(';')}`
}

export const routeGeometryHash = (appPath, campus) => sha256Hex(utf8(serializeAppPath(appPath, campus)))

// [campus, ...roadPath]; the stored road path must not already contain the campus anchor.
export function buildAppPath(campus, roadPath) {
  if (!Array.isArray(roadPath) || roadPath.length === 0) throw new TypeError('roadPath must be a non-empty array')
  if (samePoint(roadPath[0], campus)) throw new Error('roadPath already starts with the campus point')
  return [campus, ...roadPath]
}
