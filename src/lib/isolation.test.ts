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
    expect(production.some(([p]) => p.endsWith('components/map/MapView.tsx'))).toBe(true)
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

// ── Application import graph (everything reachable from the entry point, src/main.tsx) ─────────
// Glob keys are relative to this folder ('./x' = src/lib/x, '../a/b' = src/a/b); normalize to 'src/...'.
const toRepo = (key: string) => (key.startsWith('./') ? `src/lib/${key.slice(2)}` : `src/${key.slice(3)}`)
const sources = new Map(production.map(([k, t]) => [toRepo(k), t]))
const normalize = (path: string) => {
  const out: string[] = []
  for (const seg of path.split('/')) { if (seg === '..') out.pop(); else if (seg !== '.' && seg !== '') out.push(seg) }
  return out.join('/')
}
const specifiers = (text: string) => [...text.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*\(?\s*['"]([^'"]+)['"]/gm)]
  .map((m) => (m[1] ?? m[2]).replace(/\?.*$/, ''))
function resolveLocal(from: string, spec: string): string | null {
  const base = normalize(`${from.slice(0, from.lastIndexOf('/'))}/${spec}`)
  // './x.js' may name x.ts, as TypeScript's bundler resolution and Vite allow (files shared with api/ need the .js).
  const ts = base.endsWith('.js') ? `${base.slice(0, -3)}.ts` : null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, ts, `${base}/index.ts`, `${base}/index.tsx`]) if (c && sources.has(c)) return c
  return base
}
function appGraph() {
  const files = new Set<string>()
  const external = new Set<string>()
  const queue = ['src/main.tsx']
  while (queue.length) {
    const f = queue.pop()!
    if (files.has(f)) continue
    files.add(f)
    for (const spec of specifiers(sources.get(f) ?? '')) {
      if (spec.startsWith('.')) queue.push(resolveLocal(f, spec)!)
      else external.add(spec)
    }
  }
  return { files, external }
}
const isAsset = (f: string) => /.(css|svg|png|jpe?g|webp|woff2?)$/.test(f)
const NODE_BUILTINS = /^(node:|fs$|fs\/|path$|crypto$|child_process$|os$|url$|module$|worker_threads$|stream$|buffer$|process$|util$)/

describe('application import graph', () => {
  const { files, external } = appGraph()

  it('reaches the reviewed-road activation and the roads data (sanity)', () => {
    for (const f of ['src/campuses/alangilan.ts', 'src/campuses/alangilan.roads.ts', 'src/lib/reviewedGeometry.ts', 'src/lib/routeHash.js', 'src/lib/routeVersions.js']) {
      expect(files.has(f), f).toBe(true)
    }
  })

  it('every reachable local module is a production source under src/', () => {
    for (const f of files) if (!isAsset(f)) expect(sources.has(f), f).toBe(true)
  })

  it('imports no Node API (filesystem, crypto, child processes …)', () => {
    expect([...external].filter((s) => NODE_BUILTINS.test(s))).toEqual([])
  })

  it('never reaches scripts/, the generator-only route checks, or diagnostic files', () => {
    expect([...files].filter((f) => !f.startsWith('src/') || /routeChecks|\.geojson$|diagnostic/i.test(f))).toEqual([])
  })

  it('module-level freezes in routeVersions.js are marked pure, so unused policy tables stay out of the bundle', () => {
    const text = sources.get('src/lib/routeVersions.js')!
    const calls = [...text.matchAll(/^export const \w+ = (.*?)(deepFreeze|Object\.freeze)\(/gm)]
    expect(calls.length).toBeGreaterThan(0)
    for (const m of calls) expect(m[1], m[0]).toBe('/* @__PURE__ */ ')
  })

  it('the reviewed-geometry module imports only the shared hashing and version modules and types', () => {
    expect(specifiers(sources.get('src/lib/reviewedGeometry.ts')!).sort()).toEqual(['../types', './routeHash.js', './routeVersions.js'])
    expect(specifiers(sources.get('src/lib/routeHash.js')!)).toEqual(['./routeVersions.js'])
    expect(specifiers(sources.get('src/lib/routeVersions.js')!)).toEqual([])
  })
})
