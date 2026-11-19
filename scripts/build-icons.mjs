// Regenerates every BIYAHE icon from the official "Go Pin" mark (src/components/logoGeometry.ts).
//   npm run icons
// Writes public/favicon.svg and public/icon-maskable.svg, then rasterizes the PNGs with `rsvg-convert`
// (librsvg, a system tool; no npm dependency). Geometry is the brand artboard's, unchanged:
//   tile  rect 256×256 rx 60 (Deep Blue) · pin (Cloud White) · arrow (Deep Blue, round) · sun (196,58) r16
//   arrow stroke 16 with the sun at 64 px and up; 20 at 48 px and 22 at 32 px and below, without the sun.
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEEP = '#0B2D5B'
const CLOUD = '#F8FAFC'
const SUN = '#FBBF24'
const PIN = 'M128 214C112 196 66 150 66 112A62 62 0 0 1 190 112C190 150 144 196 128 214Z'
const ARROW = 'M98 120H150M134 100L154 120L134 140'
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname

const glyph = ({ arrow, sun }) =>
  `<path d="${PIN}" fill="${CLOUD}"/>` +
  `<path d="${ARROW}" fill="none" stroke="${DEEP}" stroke-width="${arrow}" stroke-linecap="round" stroke-linejoin="round"/>` +
  (sun ? `<circle cx="196" cy="58" r="16" fill="${SUN}"/>` : '')

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${body}</svg>\n`

// Rounded tile with transparent corners: browser tabs and "any"-purpose manifest icons.
const tile = (tier) => svg(`<rect width="256" height="256" rx="60" fill="${DEEP}"/>${glyph(tier)}`)
// Full-bleed square: Apple touch icon (iOS applies its own corner mask; transparency turns black there).
const square = (tier) => svg(`<rect width="256" height="256" fill="${DEEP}"/>${glyph(tier)}`)
// Maskable: full bleed, and the glyph scaled to 75% about the centre so its farthest point (the sun's outer edge,
// about 112 units from centre at full size) sits at 84, inside the 102-unit (40%) safe-zone circle.
const maskable = svg(`<rect width="256" height="256" fill="${DEEP}"/><g transform="translate(128 128) scale(.75) translate(-128 -128)">${glyph({ arrow: 16, sun: true })}</g>`)

const SMALL = { arrow: 22, sun: false }
const LARGE = { arrow: 16, sun: true }

// The favicon is mostly drawn at 16–32 px, so it uses the artboard's 32 px tier.
writeFileSync(out('favicon.svg'), tile(SMALL))
writeFileSync(out('icon-maskable.svg'), maskable)

const tmp = mkdtempSync(join(tmpdir(), 'biyahe-icons-'))
const render = (source, file, size) => {
  const src = join(tmp, `${file}.svg`)
  writeFileSync(src, source)
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', out(file), src])
  console.log(`  ${file} ${size}×${size}`)
}
try {
  render(tile(LARGE), 'pwa-192.png', 192)
  render(tile(LARGE), 'pwa-512.png', 512)
  render(maskable, 'pwa-maskable-512.png', 512)
  render(square(LARGE), 'apple-touch-icon.png', 180)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
console.log('Icons written to public/.')
