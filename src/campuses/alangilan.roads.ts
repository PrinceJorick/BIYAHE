// Reviewed road geometry for the five Alangilan corridors. GENERATED FILE — do not edit by hand.
//
// `null` means no reviewed road set exists yet, and the app uses the hand-drawn paths in ./alangilan.ts.
// A later step generates this file from committed, validated human approval records; until then it stays
// `null`. A non-null value is used only if the complete five-route set passes validation (at build time
// in `prebuild`, and again at runtime); otherwise every corridor keeps its hand-drawn path.
import type { ReviewedRoadSet } from '../lib/reviewedGeometry'

export const alangilanRoads: ReviewedRoadSet | null = null
