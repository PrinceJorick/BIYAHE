// Official BIYAHE logo: "Go Pin" (BIYAHE Brand Guidelines artboard in the team's "BIYAHE Logo Concepts" canvas).
// A map pin holding a forward arrow, with the rising sun; the wordmark is BIYAHE in Poppins ExtraBold.
// Geometry is copied from the artboard (./logoGeometry.ts); public/favicon.svg and the PWA icons are generated
// from the same values (scripts/build-icons.mjs).

import type { CSSProperties } from 'react'
import { GO_PIN, iconTier, LOGO_COLORS } from './logoGeometry'

type A11y = {
  /** Accessible name. Pass null when the mark sits beside text that already names BIYAHE (decorative). */
  label?: string | null
}

const named = (label: string | null | undefined) => (label != null ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const })

/** The standalone pin + sun (no tile). `size` is the height; on dark surfaces the pin turns cloud white. */
export function LogoMark({ size = 32, onDark = false, sun = true, className, label = null }: { size?: number; onDark?: boolean; sun?: boolean; className?: string } & A11y) {
  const body = onDark ? LOGO_COLORS.cloud : LOGO_COLORS.deep
  const ink = onDark ? LOGO_COLORS.deep : LOGO_COLORS.cloud
  return (
    <svg className={className} width={Math.round((size * 166) / 188)} height={size} viewBox={GO_PIN.markViewBox} focusable="false" {...named(label)}>
      <path d={GO_PIN.pin} fill={body} />
      <path d={GO_PIN.arrow} fill="none" stroke={ink} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
      {sun && <circle cx={GO_PIN.sun.cx} cy={GO_PIN.sun.cy} r={GO_PIN.sun.r} fill={LOGO_COLORS.sun} />}
    </svg>
  )
}

/** The app icon: Deep Blue rounded tile, cloud pin, deep arrow; small sizes use the artboard's favicon tiers. */
export function AppIcon({ size = 48, className, label = null }: { size?: number; className?: string } & A11y) {
  const tier = iconTier(size)
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 256 256" focusable="false" {...named(label)}>
      <rect width="256" height="256" rx="60" fill={LOGO_COLORS.deep} />
      <path d={GO_PIN.pin} fill={LOGO_COLORS.cloud} />
      <path d={GO_PIN.arrow} fill="none" stroke={LOGO_COLORS.deep} strokeWidth={tier.arrow} strokeLinecap="round" strokeLinejoin="round" />
      {tier.sun && <circle cx={GO_PIN.sun.cx} cy={GO_PIN.sun.cy} r={GO_PIN.sun.r} fill={LOGO_COLORS.sun} />}
    </svg>
  )
}

/**
 * Horizontal lockup: pin + BIYAHE wordmark, optionally with the "People • Places • Safer tomorrows" line.
 * Named "BIYAHE" for assistive tech by default; pass label={null} inside a link that already carries the name.
 */
export default function Logo({ size = 32, onDark = false, tagline = false, className, label = 'BIYAHE' }: {
  size?: number; onDark?: boolean; tagline?: boolean; className?: string
} & A11y) {
  return (
    <span className={`logo${onDark ? ' logo-on-dark' : ''}${className ? ` ${className}` : ''}`} {...(label != null ? { role: 'img', 'aria-label': label } : {})}
      style={{ '--logo-h': `${size}px` } as CSSProperties}>
      <LogoMark size={size} onDark={onDark} />
      <span className="logo-text" aria-hidden="true">
        <span className="logo-word">BIYAHE</span>
        {tagline && <span className="logo-tagline">People • Places • Safer tomorrows</span>}
      </span>
    </span>
  )
}
