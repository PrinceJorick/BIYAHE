// Go Pin brand mark: geometry matches the brand artboard, small-size tiers, accessible naming, and the public
// icons are generated from the same mark (not the retired Locator b or Jeepney Buddy concepts).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import favicon from '../../public/favicon.svg?raw'
import maskableIcon from '../../public/icon-maskable.svg?raw'
import Logo, { AppIcon, LogoMark } from './Logo'
import { GO_PIN, iconTier } from './logoGeometry'

const PIN = 'M128 214C112 196 66 150 66 112A62 62 0 0 1 190 112C190 150 144 196 128 214Z'
const ARROW = 'M98 120H150M134 100L154 120L134 140'

describe('Go Pin mark', () => {
  it('uses the artboard geometry: pin, forward arrow and sun, cropped to the mark', () => {
    expect(GO_PIN.pin).toBe(PIN)
    expect(GO_PIN.arrow).toBe(ARROW)
    const html = renderToStaticMarkup(createElement(LogoMark, { size: 52 }))
    expect(html).toContain('viewBox="56 36 166 188"')
    expect(html).toContain(`d="${PIN}" fill="#0B2D5B"`)
    expect(html).toContain(`d="${ARROW}" fill="none" stroke="#F8FAFC" stroke-width="16"`)
    expect(html).toContain('cx="196" cy="58" r="16" fill="#FBBF24"')
  })

  it('keeps the artboard proportions (166 × 188) at every size', () => {
    for (const size of [24, 32, 52, 150]) {
      const html = renderToStaticMarkup(createElement(LogoMark, { size }))
      expect(html).toContain(`width="${Math.round((size * 166) / 188)}" height="${size}"`)
    }
  })

  it('inverts pin and arrow on dark surfaces and keeps the sun', () => {
    const html = renderToStaticMarkup(createElement(LogoMark, { onDark: true }))
    expect(html).toContain(`d="${PIN}" fill="#F8FAFC"`)
    expect(html).toContain('stroke="#0B2D5B"')
    expect(html).toContain('fill="#FBBF24"')
  })

  it('is decorative by default and named only when asked', () => {
    expect(renderToStaticMarkup(createElement(LogoMark, {}))).toContain('aria-hidden="true"')
    const html = renderToStaticMarkup(createElement(LogoMark, { label: 'BIYAHE' }))
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="BIYAHE"')
    expect(html).not.toContain('aria-hidden')
  })
})

describe('App icon', () => {
  it('is the Deep Blue tile with a cloud pin and deep arrow', () => {
    const html = renderToStaticMarkup(createElement(AppIcon, { size: 128 }))
    expect(html).toContain('rx="60" fill="#0B2D5B"')
    expect(html).toContain(`d="${PIN}" fill="#F8FAFC"`)
    expect(html).toContain('stroke="#0B2D5B" stroke-width="16"')
    expect(html).toContain('fill="#FBBF24"')
  })

  it('keeps the artboard favicon tiers: heavier arrow and no sun when small', () => {
    expect(iconTier(128)).toEqual({ arrow: 16, sun: true })
    expect(iconTier(64)).toEqual({ arrow: 16, sun: true })
    expect(iconTier(48)).toEqual({ arrow: 20, sun: false })
    expect(iconTier(32)).toEqual({ arrow: 22, sun: false })
    expect(iconTier(16)).toEqual({ arrow: 22, sun: false })
    expect(renderToStaticMarkup(createElement(AppIcon, { size: 32 }))).not.toContain('#FBBF24')
  })
})

describe('Logo lockup', () => {
  it('announces BIYAHE once; the mark and text inside are hidden', () => {
    const html = renderToStaticMarkup(createElement(Logo, { size: 30 }))
    expect(html.match(/aria-label="BIYAHE"/g)).toHaveLength(1)
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2)
    expect(html).toContain('>BIYAHE</span>')
  })

  it('can carry the brand tagline', () => {
    expect(renderToStaticMarkup(createElement(Logo, { tagline: true }))).toContain('People • Places • Safer tomorrows')
  })

  it('can be fully decorative inside a labelled link', () => {
    const html = renderToStaticMarkup(createElement(Logo, { size: 32, onDark: true, label: null }))
    expect(html).not.toContain('aria-label')
    expect(html).not.toContain('role="img"')
  })
})

describe('Public icons', () => {
  const pub = { 'favicon.svg': favicon, 'icon-maskable.svg': maskableIcon }

  it('favicon and maskable icon are the Go Pin mark', () => {
    for (const svg of Object.values(pub)) {
      expect(svg).toContain(PIN)
      expect(svg).toContain(ARROW)
      // Retired Locator b geometry (stem, bowl) is gone.
      expect(svg).not.toContain('M92 58V150')
      expect(svg).not.toContain('r="48"')
    }
  })

  it('favicon uses the 32 px tier (no sun); maskable fills the square edge to edge with the sun', () => {
    expect(pub['favicon.svg']).toContain('stroke-width="22"')
    expect(pub['favicon.svg']).not.toContain('#FBBF24')
    expect(pub['icon-maskable.svg']).toMatch(/<rect width="256" height="256" fill="#0B2D5B"\/>/)
    expect(pub['icon-maskable.svg']).toContain('#FBBF24')
  })
})
