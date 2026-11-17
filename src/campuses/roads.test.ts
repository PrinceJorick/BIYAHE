// Build gate for reviewed road data. `npm run build` runs this file first (`prebuild`), so invalid,
// partial or tampered road data cannot reach a production bundle.
//
// The first block checks the REAL repository state (src/campuses/alangilan.roads.ts and the committed
// approval files). The rest exercises the check with synthetic, in-memory approval sets built from the
// shared test fixture; nothing here creates approval records or road geometry.
import { describe, expect, it } from 'vitest'
import { recordPath, EVIDENCE_PATH } from '../../scripts/approve-routes.mjs'
import { validateReviewedRoadsForBuild } from '../../scripts/check-reviewed-roads'
import {
  FIXTURE, makeEvidence, makeFixture, makeRecord, NOTES, osrmBodyFor, PHOTOS, RUN_ID, type Fixture,
} from '../../scripts/fixtures/approval-fixture'
import { REVIEWED_ROADS_FORMAT, type ReviewedRoadSet } from '../lib/reviewedGeometry'
import { CAMPUS, CORRIDORS, recordSha256, type ApprovalRecord, type SharedEvidence } from '../lib/routeChecks'
import { routeGeometryHash } from '../lib/routeHash.js'
import { VERSIONS } from '../lib/routeVersions'
import type { LatLng } from '../types'
import { alangilan, ALANGILAN_HAND_DRAWN_CORRIDORS } from './alangilan'
import { alangilanRoads } from './alangilan.roads'

// ── Real repository state ───────────────────────────────────────────────────

const strip = (p: string) => p.replace(/^\//, '')
const approvalTexts = import.meta.glob<string>('/docs/routes/approvals/**/*.json', { query: '?raw', import: 'default', eager: true })
const repoFiles = new Set(Object.keys(import.meta.glob(['/docs/routes/**/*', '!/docs/routes/diagnostics/**'])).map(strip))
const repoText = (path: string) => approvalTexts[`/${path}`] ?? null

describe('build gate: the repository road data', () => {
  it('passes the build check (null today: nothing to activate)', () => {
    const res = validateReviewedRoadsForBuild({ roads: alangilanRoads, readText: repoText, knownFiles: repoFiles })
    expect(res.problems).toEqual([])
    expect(res.ok).toBe(true)
    if (alangilanRoads === null) expect(res.active).toBe(false)
  })

  it('the app uses exactly what the build check allows', () => {
    if (alangilanRoads === null) {
      expect(alangilan.corridors).toBe(ALANGILAN_HAND_DRAWN_CORRIDORS)
    } else {
      expect(alangilan.corridors.map((c) => c.path)).toEqual(alangilanRoads.routes.map((r) => r.path))
    }
  })

  it('reads the approval folder (sanity: the README is visible to the file list)', () => {
    expect(repoFiles.has('docs/routes/approvals/README.md')).toBe(true)
  })
})

// ── Synthetic approval sets ─────────────────────────────────────────────────

const COMMIT = 'a'.repeat(40)
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`

type Repo = { roads: ReviewedRoadSet; files: Map<string, string> }

// A complete, valid synthetic set: records and evidence from the fixture, roads data generated from them.
function makeRepo(edit?: (ctx: { records: Record<string, ApprovalRecord>; evidence: SharedEvidence; fx: Fixture }) => void, fx: Fixture = FIXTURE): Repo {
  const evidence = makeEvidence()
  const records = Object.fromEntries(CORRIDORS.map((c) => [c.id, makeRecord(c.id, evidence, fx)]))
  edit?.({ records, evidence, fx })
  const files = new Map<string, string>([[EVIDENCE_PATH, json(evidence)], [PHOTOS, '# Photo log\n'], [NOTES, '# Review notes\n']])
  for (const c of CORRIDORS) files.set(recordPath(c.id), json(records[c.id]))
  const roads: ReviewedRoadSet = {
    format: REVIEWED_ROADS_FORMAT, campus: 'alangilan', campusAnchor: [...CAMPUS] as LatLng, versions: { ...VERSIONS },
    runId: RUN_ID, geojsonSha256: fx.geo.sha256,
    evidence: { path: EVIDENCE_PATH, recordSha256: recordSha256(files.get(EVIDENCE_PATH)!), commitSha: COMMIT },
    routes: CORRIDORS.map((c) => {
      const r = fx.results.find((x) => x.id === c.id)!
      return {
        routeId: c.id, path: structuredClone(r.appPath as LatLng[]), routeGeometrySha256: r.routeGeometrySha256 as string, pathEnds: c.pathEnds,
        approval: { path: recordPath(c.id), recordSha256: recordSha256(files.get(recordPath(c.id))!), commitSha: COMMIT },
      }
    }),
  }
  return { roads, files }
}
const check = (repo: Repo) => validateReviewedRoadsForBuild({ roads: repo.roads, readText: (p) => repo.files.get(p) ?? null, knownFiles: new Set(repo.files.keys()) })
const problems = (repo: Repo) => check(repo).problems.join('\n')
// Rewrites a file and records its new hash, as if the roads data had been regenerated from it.
function rehash(repo: Repo, path: string, text: string) {
  repo.files.set(path, text)
  const h = recordSha256(text)
  if (path === EVIDENCE_PATH) repo.roads.evidence.recordSha256 = h
  else repo.roads.routes.find((r) => r.approval.path === path)!.approval.recordSha256 = h
}

describe('build check: accepts', () => {
  it('null road data', () => {
    expect(validateReviewedRoadsForBuild({ roads: null, readText: () => null, knownFiles: new Set() })).toEqual({ ok: true, active: false, problems: [] })
  })

  it('a complete, valid five-route set', () => {
    expect(check(makeRepo())).toEqual({ ok: true, active: true, problems: [] })
  })

  it('San Jose ending 203 m from its configured endpoint, with the accepted endpoint relationship', () => {
    const fx = makeFixture({ sanjose: osrmBodyFor('sanjose', 203) })
    expect(check(makeRepo(undefined, fx))).toEqual({ ok: true, active: true, problems: [] })
  })

  it('the same record content saved with CRLF line endings', () => {
    const repo = makeRepo()
    const path = recordPath('bauan')
    repo.files.set(path, repo.files.get(path)!.replace(/\n/g, '\r\n'))
    expect(check(repo).problems).toEqual([])
  })
})

describe('build check: rejects', () => {
  it('malformed road data', () => {
    const repo = makeRepo()
    ;(repo.roads as Record<string, unknown>).routes = 'five'
    expect(problems(repo)).toMatch(/routes must be an array/)
  })

  it('a partial (four-route) set', () => {
    const repo = makeRepo()
    repo.roads.routes = repo.roads.routes.filter((r) => r.routeId !== 'bauan')
    expect(problems(repo)).toMatch(/route bauan is missing/)
  })

  it('a duplicated route', () => {
    const repo = makeRepo()
    repo.roads.routes[1] = structuredClone(repo.roads.routes[0])
    expect(problems(repo)).toMatch(/duplicate route lipa/)
  })

  it('a tampered path (geometry hash mismatch)', () => {
    const repo = makeRepo()
    const p = repo.roads.routes[2].path
    p[2] = [Number((p[2][0] + 0.00001).toFixed(5)), p[2][1]]
    expect(problems(repo)).toMatch(/bauan: routeGeometrySha256 does not match the path/)
  })

  it('incompatible versions', () => {
    const repo = makeRepo()
    repo.roads.versions = { ...VERSIONS, warningSchemaVersion: 'ws-0' }
    expect(problems(repo)).toMatch(/incompatible versions: warningSchemaVersion/)
  })

  it('one character changed in a route record after generation', () => {
    const repo = makeRepo()
    const path = recordPath('tanauan')
    repo.files.set(path, repo.files.get(path)!.replace('Project team', 'Project teem'))
    expect(problems(repo)).toMatch(/docs\/routes\/approvals\/alangilan\/tanauan.json has changed since the road data was generated/)
  })

  it('one character changed in the evidence file after generation', () => {
    const repo = makeRepo()
    repo.files.set(EVIDENCE_PATH, repo.files.get(EVIDENCE_PATH)!.replace('Paved', 'Paves'))
    expect(problems(repo)).toMatch(/alangilan-campus-exit.json has changed since the road data was generated/)
  })

  it('a recorded hash that does not match unchanged content', () => {
    const repo = makeRepo()
    repo.roads.routes[0].approval.recordSha256 = 'b'.repeat(64)
    expect(problems(repo)).toMatch(/lipa.json has changed since the road data was generated/)
  })

  it('a missing record or evidence file', () => {
    const a = makeRepo()
    a.files.delete(recordPath('sanjose'))
    expect(problems(a)).toMatch(/sanjose.json is missing/)
    const b = makeRepo()
    b.files.delete(EVIDENCE_PATH)
    expect(problems(b)).toMatch(/alangilan-campus-exit.json is missing/)
  })

  it('an extra file in the records folder', () => {
    const repo = makeRepo()
    repo.files.set('docs/routes/approvals/alangilan/pablo-borbon.json', '{}\n')
    expect(problems(repo)).toMatch(/unexpected file in docs\/routes\/approvals\/alangilan: .*pablo-borbon.json/)
  })

  it('a record with a byte-order mark', () => {
    const repo = makeRepo()
    const path = recordPath('lipa')
    repo.files.set(path, `\uFEFF${repo.files.get(path)!}`)
    expect(problems(repo)).toMatch(/lipa.json: Record starts with a UTF-8 byte-order mark/)
  })

  it('a record with duplicate keys (strict JSON)', () => {
    const repo = makeRepo()
    const path = recordPath('lipa')
    rehash(repo, path, repo.files.get(path)!.replace('"campus": "alangilan",', '"campus": "alangilan",\n  "campus": "alangilan",'))
    expect(problems(repo)).toMatch(/lipa.json: .*[Dd]uplicate key/)
  })

  it.each([
    ['run ID', (r: ApprovalRecord) => { r.runId = '20261202T000000Z-other1' }, /lipa record: runId does not match the road data/],
    ['GeoJSON hash', (r: ApprovalRecord) => { r.geojsonSha256 = 'd'.repeat(64) }, /lipa record: geojsonSha256 does not match the road data/],
    ['geometry hash', (r: ApprovalRecord) => { r.routeGeometrySha256 = 'd'.repeat(64) }, /lipa record: routeGeometrySha256 does not match the road path/],
    ['generator version', (r: ApprovalRecord) => { r.generatorVersion = '2.0.0' }, /lipa record: generatorVersion does not match the road data/],
    ['approval schema version', (r: ApprovalRecord) => { r.approvalSchemaVersion = 'as-0' }, /lipa record: approvalSchemaVersion does not match the road data/],
  ])('a record whose %s does not match the road data (record re-hashed)', (_l, mutate, message) => {
    const repo = makeRepo()
    const rec = JSON.parse(repo.files.get(recordPath('lipa'))!) as ApprovalRecord
    mutate(rec)
    rehash(repo, recordPath('lipa'), json(rec))
    expect(problems(repo)).toMatch(message)
  })

  it('records that fail the approval validation (an unresolved warning blocks)', () => {
    const repo = makeRepo(({ records }) => { records.batangas.resolutions[0].outcome = 'unresolved' })
    const res = check(repo)
    expect(res.ok).toBe(false)
    expect(res.problems.join('\n')).toMatch(/blocker: .*unresolved/)
  })

  it('evidence that does not establish public access blocks every route', () => {
    const repo = makeRepo(({ evidence }) => { evidence.publicAccess = { status: 'restricted', finding: 'Gate closed to the public.' } })
    expect(problems(repo)).toMatch(/blocker: shared campus-exit evidence does not establish public access and usability/)
  })

  it('an invalid evidence reference (provenance)', () => {
    const repo = makeRepo(({ evidence }) => { evidence.evidenceRefs = ['C:\\photos\\gate.jpg'] })
    expect(problems(repo)).toMatch(/local machine path/)
  })

  it('a referenced evidence file that is not in the repository', () => {
    const repo = makeRepo()
    repo.files.delete(PHOTOS)
    expect(problems(repo)).toMatch(/campus-exit-photos.md is not a committed repository file/)
  })

  it('pathEnds that differ from the configured corridor (consistent elsewhere)', () => {
    const repo = makeRepo(({ records }) => { records.lipa.pathEnds = null })
    repo.roads.routes[0].pathEnds = null
    const p = problems(repo)
    expect(p).toMatch(/lipa: pathEnds must be "partial" \(configured corridor\)/)
  })

  it('a path that ends away from the configured endpoint without an accepted endpoint relationship', () => {
    const repo = makeRepo()
    const route = repo.roads.routes[1]
    route.path = [...route.path, [13.9, 121.2]]
    route.routeGeometrySha256 = routeGeometryHash(route.path, CAMPUS as LatLng)
    const rec = JSON.parse(repo.files.get(recordPath('batangas'))!) as ApprovalRecord
    rec.routeGeometrySha256 = route.routeGeometrySha256
    for (const r of rec.resolutions) r.routeGeometrySha256 = route.routeGeometrySha256
    rehash(repo, recordPath('batangas'), json(rec))
    expect(problems(repo)).toMatch(/batangas: the path ends \d+ m from the configured endpoint without an accepted endpoint relationship/)
  })
})
