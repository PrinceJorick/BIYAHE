// "Go Pin" brand geometry and colours (BIYAHE Brand Guidelines artboard, team logo canvas), shared by the Logo
// component, its tests and scripts/build-icons.mjs (which repeats the same values). A map pin (where you are and
// where to wait) holding a forward arrow (know when it is safe to go), with the rising sun beside it.

export const LOGO_COLORS = { deep: '#0B2D5B', cloud: '#F8FAFC', sun: '#FBBF24', line: '#E2E8F0' } as const

export const GO_PIN = {
  /** The pin body, in the 256-unit app-icon space. */
  pin: 'M128 214C112 196 66 150 66 112A62 62 0 0 1 190 112C190 150 144 196 128 214Z',
  /** The forward arrow inside the pin (stroked, round caps and joins). */
  arrow: 'M98 120H150M134 100L154 120L134 140',
  sun: { cx: 196, cy: 58, r: 16 },
  /** The standalone mark (no tile) is cropped to the pin and sun. */
  markViewBox: '56 36 166 188',
} as const

/**
 * The artboard's small-size tiers for the app icon: the arrow gets heavier and the sun is dropped below 64 px
 * (48 px: stroke 20; 32 px and below: stroke 22), so the favicon stays legible.
 */
export function iconTier(size: number): { arrow: number; sun: boolean } {
  if (size <= 32) return { arrow: 22, sun: false }
  if (size < 64) return { arrow: 20, sun: false }
  return { arrow: 16, sun: true }
}
