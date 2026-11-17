// Routing guard: the route generator (scripts/build-routes.mjs) and its diagnostic output are
// developer-only. Production app code must not import the generator, call the OSRM demo server,
// use generated route candidates before approval, or reference diagnostic geometry.
// Only production files are scanned (test files are excluded), so the forbidden strings written
// in tests — including this one — can never match themselves.
// Sources are read with Vite's import.meta.glob (?raw), so no Node types are needed under tsc.
import { describe, expect, it } from 'vitest'

const all = import.meta.glob<string>('../**/*.{ts,tsx,js,mjs}', { query: '?raw', import: 'default', eager: true })
const production = Object.entries(all).filter(([path]) => !/\.test\.tsx?$/.test(path))
const offenders = (pred: (text: string) => boolean) => production.filter(([, t]) => pred(t)).map(([p]) => p)

// Anything diagnostic placed under public/ would be copied into dist and could be precached.
const publicDiagnostics = Object.keys(import.meta.glob(['/public/**/*.geojson', '/public/**/*diagnostic*', '/public/**/*DIAGNOSTIC*']))

describe('route generator isolation (production files only)', () => {
  it('scans production files and no test files', () => {
    expect(production.some(([p]) => p.endsWith('components/CorridorMap.tsx'))).toBe(true)
    // Same-folder files are keyed as './geo.js', others as '../dir/file'.
    expect(production.some(([p]) => /(^|\/)geo\.js$/.test(p))).toBe(true)
    expect(production.some(([p]) => p.endsWith('.test.ts'))).toBe(false)
  })

  it('no production file imports from scripts/', () => {
    expect(offenders((t) => /from\s+['"][^'"]*\bscripts\//.test(t))).toEqual([])
  })

  it('no production file contacts the OSRM demo server', () => {
    expect(offenders((t) => t.includes('router.project-osrm.org'))).toEqual([])
  })

  it('no production file uses the generated Alangilan routes yet', () => {
    expect(offenders((t) => /alangilan\.routes/.test(t))).toEqual([])
  })

  it('no production file imports the generator-only route checks', () => {
    expect(offenders((t) => /from\s+['"][^'"]*routeChecks(\.js)?['"]/.test(t))).toEqual([])
  })

  it('no production file references diagnostic geometry', () => {
    expect(offenders((t) => /\.geojson\b/i.test(t))).toEqual([])
    expect(offenders((t) => /routes\/diagnostics|diagnostic-viewer/.test(t))).toEqual([])
    expect(offenders((t) => t.includes('DIAGNOSTIC'))).toEqual([])
  })

  it('public/ (copied into the app build) contains no diagnostic files', () => {
    expect(publicDiagnostics).toEqual([])
  })
})
