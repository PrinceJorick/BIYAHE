// Route geometry in use per campus, for the map's route notes. Kept out of ./index.ts so the registry stays
// free of the geometry-selection modules.
import { CAMPUS_EXIT_NOTE, type GeometrySelection } from '../lib/previewGeometry'
import type { CampusId } from '../types'
import { alangilanRouteGeometry } from './alangilan'
import { malvarRouteGeometry } from './malvar'
import { pabloBorbonRouteGeometry } from './pabloBorbon'

// exitNote: a campus-wide limitation listed once under "All routes" (null when there is none).
export const routeGeometry: Record<CampusId, { selection: GeometrySelection; exitNote: string | null }> = {
  alangilan: { selection: alangilanRouteGeometry, exitNote: CAMPUS_EXIT_NOTE },
  'pablo-borbon': { selection: pabloBorbonRouteGeometry, exitNote: null },
  malvar: { selection: malvarRouteGeometry, exitNote: null },
}
