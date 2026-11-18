// Locator b colours and size tiers, shared by the Logo component and its tests (kept out of Logo.tsx so that
// file exports components only, for fast refresh). scripts/build-icons.mjs repeats the same values.

export const LOGO_COLORS = { deep: '#0B2D5B', cloud: '#F8FAFC', sun: '#FBBF24', line: '#E2E8F0' } as const

/** 'dark' = deep-blue tile with a white b (default); 'light' = white tile with a deep-blue b, for dark surfaces. */
export type LogoVariant = 'dark' | 'light'

// [stroke width, sun radius] per size tier, from the artboard (64 px, 40 px, 32 px renders).
export function markTier(size: number): { stroke: number; sun: number } {
  if (size <= 32) return { stroke: 40, sun: 16 }
  if (size <= 40) return { stroke: 36, sun: 15 }
  return { stroke: 32, sun: 13 }
}
