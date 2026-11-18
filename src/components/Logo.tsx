// Official BIYAHE logo: "Locator b" (Minimal startup marks, concept 1, in the team's "BIYAHE Logo Concepts"
// canvas). The bowl of the "b" doubles as a "you are here" marker with the sun at its centre.
// Geometry is copied from that artboard, not redrawn; public/favicon.svg and the PWA icons use the same paths
// (scripts/build-icons.mjs). The artboard's own small-size tiers are kept: heavier strokes and a larger sun at
// 40 px and at 32 px and below, so the mark stays legible as a favicon.

import { LOGO_COLORS, markTier, type LogoVariant } from './logoGeometry'

type A11y = {
  /** Accessible name. Pass null when the mark sits beside text that already names BIYAHE (decorative). */
  label?: string | null
  /** Optional tooltip / SVG <title>. */
  title?: string
}

export function LogoMark({ size = 40, variant = 'dark', className, label = null, title }: { size?: number; variant?: LogoVariant; className?: string } & A11y) {
  const { stroke, sun } = markTier(size)
  const tile = variant === 'dark' ? LOGO_COLORS.deep : LOGO_COLORS.cloud
  const ink = variant === 'dark' ? LOGO_COLORS.cloud : LOGO_COLORS.deep
  const named = label != null
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 256 256" focusable="false"
      {...(named ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      {title && <title>{title}</title>}
      <rect width="256" height="256" rx="60" fill={tile} {...(variant === 'light' ? { stroke: LOGO_COLORS.line, strokeWidth: 4 } : {})} />
      <path d="M92 58V150" stroke={ink} strokeWidth={stroke} strokeLinecap="round" />
      <circle cx="140" cy="150" r="48" fill="none" stroke={ink} strokeWidth={stroke} />
      <circle cx="140" cy="150" r={sun} fill={LOGO_COLORS.sun} />
    </svg>
  )
}

// The original stroked "biyahe" wordmark from the same canvas (the lockups beside the marks), with the sun as
// the dot of the i. viewBox and paths unchanged.
export function Wordmark({ height = 28, onDark = false }: { height?: number; onDark?: boolean }) {
  return (
    <svg className="logo-word" width={(height * 520) / 170} height={height} viewBox="-10 0 520 170" aria-hidden="true" focusable="false">
      <g stroke={onDark ? LOGO_COLORS.cloud : LOGO_COLORS.deep} strokeWidth="22" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M12 12V100" />
        <circle cx="43" cy="69" r="31" />
        <path d="M106 46V100" />
        <path d="M140 46V72A27 27 0 0 0 194 72V46" />
        <path d="M194 72V110Q194 144 156 144H140" />
        <circle cx="257" cy="69" r="31" />
        <path d="M288 46V100" />
        <path d="M322 12V100" />
        <path d="M322 70A30 30 0 0 1 382 70V100" />
        <path d="M414 69H476A31 31 0 1 0 466 93" />
      </g>
      <circle cx="106" cy="16" r="14" fill={LOGO_COLORS.sun} />
    </svg>
  )
}

/**
 * Mark + wordmark lockup. Named "BIYAHE" for assistive tech by default; pass label={null} inside a link or
 * heading that already carries the name.
 */
export default function Logo({ size = 36, onDark = false, className, label = 'BIYAHE', title }: { size?: number; onDark?: boolean; className?: string } & A11y) {
  const named = label != null
  return (
    <span className={className ? `logo ${className}` : 'logo'} {...(named ? { role: 'img', 'aria-label': label } : {})} title={title}>
      {/* On the deep-blue rail the light tile keeps the mark's edge visible. */}
      <LogoMark size={size} variant={onDark ? 'light' : 'dark'} />
      <Wordmark height={Math.round(size * 0.9)} onDark={onDark} />
    </span>
  )
}
