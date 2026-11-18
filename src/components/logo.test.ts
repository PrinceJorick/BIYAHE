// Locator b brand mark: geometry matches the original artboard, small-size tiers, accessible naming, and the
// public icons are generated from the same mark (not the retired Jeepney Buddy concept).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import favicon from '../../public/favicon.svg?raw'
import maskableIcon from '../../public/icon-maskable.svg?raw'
import Logo, { LogoMark } from './Logo'
import { markTier } from './logoGeometry'

const pub = (f: string) => ({ 'favicon.svg': favicon, 'icon-maskable.svg': maskableIcon })[f]!

describe('Locator b mark', () => {
  it('uses the artboard geometry: tile, stem, bowl and sun', () => {
    const html = renderToStaticMarkup(createElement(LogoMark, { size: 64 }))
    expect(html).toContain('viewBox="0 0 256 256"')
    expect(html).toContain('rx="60" fill="#0B2D5B"')
    expect(html).toContain('d="M92 58V150"')
    expect(html).toContain('cx="140" cy="150" r="48"')
    expect(html).toContain('r="13" fill="#FBBF24"')
  })

  it('keeps the artboard size tiers (heavier strokes, larger sun when small)', () => {
    expect(markTier(220)).toEqual({ stroke: 32, sun: 13 })
    expect(markTier(64)).toEqual({ stroke: 32, sun: 13 })
    expect(markTier(40)).toEqual({ stroke: 36, sun: 15 })
    expect(markTier(32)).toEqual({ stroke: 40, sun: 16 })
    expect(markTier(16)).toEqual({ stroke: 40, sun: 16 })
  })

  it('renders at every checked size with a matching width and height', () => {
    for (const size of [16, 24, 32, 48, 64, 120]) {
      const html = renderToStaticMarkup(createElement(LogoMark, { size }))
      expect(html).toContain(`width="${size}" height="${size}"`)
    }
  })

  it('is decorative by default and named only when asked', () => {
    expect(renderToStaticMarkup(createElement(LogoMark, {}))).toContain('aria-hidden="true"')
    const named = renderToStaticMarkup(createElement(LogoMark, { label: 'BIYAHE' }))
    expect(named).toContain('role="img"')
    expect(named).toContain('aria-label="BIYAHE"')
    expect(named).not.toContain('aria-hidden')
  })

  it('light variant inverts tile and ink and keeps the sun', () => {
    const html = renderToStaticMarkup(createElement(LogoMark, { size: 64, variant: 'light' }))
    expect(html).toContain('fill="#F8FAFC" stroke="#E2E8F0"')
    expect(html).toContain('stroke="#0B2D5B"')
    expect(html).toContain('fill="#FBBF24"')
  })
})

describe('Logo lockup', () => {
  it('announces BIYAHE once; the mark and wordmark inside are hidden', () => {
    const html = renderToStaticMarkup(createElement(Logo, { size: 30 }))
    expect(html.match(/aria-label="BIYAHE"/g)).toHaveLength(1)
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2)
  })

  it('can be fully decorative inside a labelled link', () => {
    const html = renderToStaticMarkup(createElement(Logo, { size: 32, onDark: true, label: null }))
    expect(html).not.toContain('aria-label')
    expect(html).not.toContain('role="img"')
  })
})

describe('Public icons', () => {
  it('favicon and maskable icon are the Locator b mark', () => {
    for (const f of ['favicon.svg', 'icon-maskable.svg']) {
      const svg = pub(f)
      expect(svg).toContain('M92 58V150')
      expect(svg).toContain('cx="140" cy="150" r="48"')
      expect(svg).toContain('#FBBF24')
      // Retired Jeepney Buddy geometry (signboard, wheels) is gone.
      expect(svg).not.toContain('rx="28"')
      expect(svg).not.toContain('#2563EB')
    }
  })

  it('maskable icon fills the square edge to edge', () => {
    expect(pub('icon-maskable.svg')).toMatch(/<rect width="256" height="256" fill="#0B2D5B"\/>/)
  })
})
