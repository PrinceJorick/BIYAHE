// Regenerates every BIYAHE icon from the official "Locator b" mark (src/components/Logo.tsx).
//   npm run icons
// Writes public/favicon.svg and public/icon-maskable.svg, then rasterizes the PNGs with `rsvg-convert`
// (librsvg, a system tool; no npm dependency). Geometry is the artboard's, unchanged:
//   tile  rect 256×256 rx 60 · stem M92 58V150 · bowl circle (140,150) r48 · sun circle (140,150)
//   stroke/sun: 32/13 above 40 px, 36/15 at 40 px, 40/16 at 32 px and below.
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DEEP = '#0B2D5B'
const CLOUD = '#F8FAFC'
const SUN = '#FBBF24'
const out = (f) => new URL(`../public/${f}`, import.meta.url).pathname

const glyph = ({ stroke, sun }) =>
  `<path d="M92 58V150" stroke="${CLOUD}" stroke-width="${stroke}" stroke-linecap="round"/>` +
  `<circle cx="140" cy="150" r="48" fill="none" stroke="${CLOUD}" stroke-width="${stroke}"/>` +
  `<circle cx="140" cy="150" r="${sun}" fill="${SUN}"/>`

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${body}</svg>\n`

// Rounded tile with transparent corners: browser tabs and "any"-purpose manifest icons.
const tile = (tier) => svg(`<rect width="256" height="256" rx="60" fill="${DEEP}"/>${glyph(tier)}`)
// Full-bleed square: Apple touch icon (iOS applies its own corner mask; transparency turns black there).
const square = (tier) => svg(`<rect width="256" height="256" fill="${DEEP}"/>${glyph(tier)}`)
// Maskable: full bleed, and the glyph scaled to 85% about the centre so its farthest point (the stem top,
// 93 units from centre at full size) sits at 79, well inside the 102-unit (40%) safe-zone circle.
const maskable = svg(`<rect width="256" height="256" fill="${DEEP}"/><g transform="translate(128 128) scale(.85) translate(-128 -128)">${glyph({ stroke: 32, sun: 13 })}</g>`)

const SMALL = { stroke: 40, sun: 16 }
const LARGE = { stroke: 32, sun: 13 }

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
