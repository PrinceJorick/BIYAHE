#!/usr/bin/env node
// Generates road-following route geometry for every campus. Developer-only:
//   npm run routes:campuses                       all campuses
//   npm run routes:campuses -- --campus alangilan one campus
//
// For each configured route the script asks the public OSRM demo server for a driving route from the campus
// point to the destination (a town hall or terminal geocoded from OpenStreetMap), then applies the same gp-1
// processing as the Alangilan generator (processRoadPath: simplify → round → de-duplicate) and the shared
// geometry hash. Output per campus:
//   docs/routes/diagnostics/<campus>-osrm.<runId>.json   the raw OSRM responses, for review
//   src/campuses/<outFile>                               a PreviewRoadSet the app validates at runtime
// It also prints each route's distance, duration and longest named roads, used for the `via` labels and
// usual travel times in src/campuses/<campus>.ts.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { haversineM } from '../src/lib/geo.js'
import { buildAppPath, geojsonSha256, processRoadPath, routeGeometryHash } from '../src/lib/routeChecks.js'
import { VERSIONS } from '../src/lib/routeVersions.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OSRM = 'https://router.project-osrm.org/route/v1/driving'

// Anchors must equal LOCATION in src/campuses/<campus>.ts exactly. Destinations: OpenStreetMap features
// found through Nominatim on 2026-11-18 (OSM type/id noted for each).
export const CAMPUS_ROUTES = {
  // Full trips from campus to each town. Replaces the earlier Alangilan preview (alangilan.preview.roads.ts, kept
  // as the record of the reviewed diagnostic run), whose routes ended at the hand-drawn corridor ends 3-26 km
  // short of the towns they are named after. Batangas City proper keeps the team's downtown end on P. Burgos St.
  alangilan: {
    exportName: 'ALANGILAN_TRIP_ROADS',
    outFile: 'alangilan.trip.roads.ts',
    anchor: [13.7842, 121.0744],
    routes: [
      { id: 'lipa', end: [13.9553995, 121.1606111], endLabel: 'Lipa City Grand Terminal (OSM way 795018965)' },
      { id: 'batangas', end: [13.7575, 121.058], endLabel: 'Batangas City poblacion, P. Burgos Street (team corridor end)' },
      { id: 'bauan', end: [13.7937808, 121.0071323], endLabel: 'Bauan Municipal Hall (OSM way 312556517)' },
      { id: 'sanjose', end: [13.8786002, 121.1047491], endLabel: 'San Jose poblacion (OSM relation 10719480)' },
      { id: 'tanauan', end: [14.0865988, 121.1258532], endLabel: 'Tanauan City Hall (OSM way 557511385)' },
    ],
  },
  'pablo-borbon': {
    exportName: 'PABLO_BORBON_PREVIEW_ROADS',
    outFile: 'pablo-borbon.preview.roads.ts',
    anchor: [13.75547, 121.05364],
    routes: [
      { id: 'pb-lipa', end: [13.9553995, 121.1606111], endLabel: 'Lipa City Grand Terminal (OSM way 795018965)' },
      { id: 'pb-sanjose', end: [13.8786002, 121.1047491], endLabel: 'San Jose poblacion (OSM relation 10719480)' },
      { id: 'pb-bauan', end: [13.7937808, 121.0071323], endLabel: 'Bauan Municipal Hall (OSM way 312556517)' },
      { id: 'pb-rosario', end: [13.8456781, 121.2062705], endLabel: 'Rosario Municipal Hall (OSM way 465622580)' },
    ],
  },
  malvar: {
    exportName: 'MALVAR_PREVIEW_ROADS',
    outFile: 'malvar.preview.roads.ts',
    anchor: [14.0449, 121.1569],
    routes: [
      { id: 'mv-lipa', end: [13.9553995, 121.1606111], endLabel: 'Lipa City Grand Terminal (OSM way 795018965)' },
      { id: 'mv-tanauan', end: [14.0865988, 121.1258532], endLabel: 'Tanauan City Hall (OSM way 557511385)' },
      { id: 'mv-stotomas', end: [14.1080161, 121.1462161], endLabel: 'Santo Tomas Public Market (OSM way 39887987)' },
      { id: 'mv-batangas', end: [13.7904192, 121.0610292], endLabel: 'Batangas City Grand Terminal (OSM way 1510395294)' },
    ],
  },
}

const runId = () => `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${Math.random().toString(16).slice(2, 8)}`
const km = (m) => `${(m / 1000).toFixed(1)} km`

export const routeUrl = (anchor, end) => `${OSRM}/${anchor[1]},${anchor[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true`

// OSRM_CACHE=<dir> reads <dir>/<routeId>.json (responses saved earlier from routeUrl) instead of the network.
async function fetchRoute(anchor, end, id) {
  const url = routeUrl(anchor, end)
  const cached = process.env.OSRM_CACHE && join(process.env.OSRM_CACHE, `${id}.json`)
  if (cached && existsSync(cached)) return checked(JSON.parse(readFileSync(cached, 'utf8')))
  // curl rather than fetch(): it honours the system network configuration the same way on every machine.
  return checked(JSON.parse(execFileSync('curl', ['-sSf', '-m', '60', '-A', 'biyahe-student-project/1.0', url], { encoding: 'utf8' })))
}

function checked(body) {
  if (body.code !== 'Ok' || !body.routes?.length) throw new Error(`OSRM: ${body.code} ${body.message ?? ''}`)
  return body
}

// Longest named roads along the route, for choosing the human `via` label.
function mainRoads(route) {
  const byName = new Map()
  for (const leg of route.legs) for (const s of leg.steps) {
    const name = s.name || s.ref
    if (name) byName.set(name, (byName.get(name) ?? 0) + s.distance)
  }
  return [...byName].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, d]) => `${n} ${km(d)}`)
}

const render = (exportName, campusId, data) => [
  '// GENERATED by scripts/build-campus-roads.mjs (npm run routes:campuses). Do not edit by hand.',
  '//',
  `// Road-following route geometry for ${campusId}, from OSRM run ${data.runId}. Generated from OpenStreetMap road`,
  '// data; not physically verified. The app validates it at runtime (src/lib/previewGeometry.ts) and falls back',
  '// to the hand-drawn paths if it does not match the configured routes.',
  "import type { PreviewRoadSet } from '../lib/previewGeometry'",
  '',
  `export const ${exportName}: PreviewRoadSet = ${JSON.stringify(data, null, 2).replace(/\[\n\s+(-?[\d.]+),\n\s+(-?[\d.]+)\n\s+\]/g, '[$1, $2]')}`,
  '',
].join('\n')

async function main() {
  if (process.argv.includes('--urls')) {
    for (const cfg of Object.values(CAMPUS_ROUTES)) for (const r of cfg.routes) console.log(r.id, routeUrl(cfg.anchor, r.end))
    return
  }
  if (process.env.npm_lifecycle_event !== 'routes:campuses') {
    console.error('Run with: npm run routes:campuses')
    process.exit(1)
  }
  const id = runId()
  const only = process.argv.includes('--campus') ? process.argv[process.argv.indexOf('--campus') + 1] : null
  if (only && !(only in CAMPUS_ROUTES)) throw new Error(`Unknown campus ${only}; expected one of ${Object.keys(CAMPUS_ROUTES).join(', ')}`)
  for (const [campusId, cfg] of Object.entries(CAMPUS_ROUTES)) {
    if (only && campusId !== only) continue
    const raw = {}
    const routes = []
    console.log(`\n${campusId}`)
    for (const r of cfg.routes) {
      const body = await fetchRoute(cfg.anchor, r.end, r.id)
      raw[r.id] = { endLabel: r.endLabel, request: { from: cfg.anchor, to: r.end }, response: body }
      const route = body.routes[0]
      // The snapped start can round to the campus point itself; the anchor may appear only once.
      const road = processRoadPath(route.geometry.coordinates).filter((p) => p[0] !== cfg.anchor[0] || p[1] !== cfg.anchor[1])
      const appPath = buildAppPath(cfg.anchor, road)
      const snappedEnd = [body.waypoints.at(-1).location[1], body.waypoints.at(-1).location[0]]
      routes.push({
        routeId: r.id,
        path: appPath,
        routeGeometrySha256: routeGeometryHash(appPath, cfg.anchor),
        pathEnds: null,
        warnings: [],
        endpointSeparationM: Math.round(haversineM(r.end, snappedEnd) * 10) / 10,
        endRoad: body.waypoints.at(-1).name || '(unnamed)',
      })
      console.log(`  ${r.id.padEnd(12)} ${km(route.distance).padStart(8)}  ${Math.round(route.duration / 60)} min driving  ${appPath.length} pts  via ${mainRoads(route).join(', ')}`)
      if (!process.env.OSRM_CACHE) await new Promise((ok) => setTimeout(ok, 1100))
    }
    const rawRel = `docs/routes/diagnostics/${campusId}-osrm.${id}.json`
    const rawBytes = new TextEncoder().encode(`${JSON.stringify({ campus: campusId, runId: id, generatedAt: new Date().toISOString(), source: OSRM, routes: raw })}\n`)
    mkdirSync(dirname(join(ROOT, rawRel)), { recursive: true })
    writeFileSync(join(ROOT, rawRel), rawBytes)
    const data = {
      status: 'unverified-prototype-preview', campus: campusId, campusAnchor: cfg.anchor, runId: id,
      sourceGeojsonSha256: geojsonSha256(rawBytes), versions: VERSIONS, routes,
    }
    const target = join(ROOT, `src/campuses/${cfg.outFile}`)
    writeFileSync(`${target}.tmp`, render(cfg.exportName, campusId, data))
    renameSync(`${target}.tmp`, target)
    console.log(`  wrote ${rawRel} and src/campuses/${cfg.outFile}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
