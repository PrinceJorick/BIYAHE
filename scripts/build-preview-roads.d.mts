// Type declarations for scripts/build-preview-roads.mjs (developer-only preview generator), so tests can import
// it directly. Importing the module never writes anything: main() only runs when the file is executed with node.
import type { PreviewRoadSet } from '../src/lib/previewGeometry'
import type { CorridorConfig } from '../src/lib/routeChecks'
import type { LatLng } from '../src/types'

export const PREVIEW_SOURCE: Readonly<{ runId: string; sha256: string }>
export function sourcePath(runId: string): string
export const TARGET: string
export const PREVIEW_STATUS: 'unverified-prototype-preview'
export function buildPreviewRoads(bytes: Uint8Array, opts?: { expected?: { runId: string; sha256: string }; corridors?: readonly CorridorConfig[]; campus?: LatLng }): PreviewRoadSet
export function renderPreviewModule(data: PreviewRoadSet): string
