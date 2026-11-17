// Tests for the validate-only approval validator (scripts/approve-routes.mjs), imported directly.
// Everything runs on an in-memory synthetic repository: files and Git state are fakes, the diagnostic GeoJSON
// is produced by the real generator serializer from synthetic OSRM responses, and nothing touches the real
// approval records, diagnostics or Git.
import { describe, expect, it } from 'vitest'
import * as approve from '../../scripts/approve-routes.mjs'
import approveSource from '../../scripts/approve-routes.mjs?raw'
import * as gen from '../../scripts/build-routes.mjs'
import type { LatLng } from '../types'
import { haversineM } from './geo'
import { CORRIDORS, sha256Hex, type ApprovalRecord, type SharedEvidence } from './routeChecks'
import {
  enc, FIXTURE, GEO, GEO_PATH, makeEvidence, makeFixture, makeRecord, NOTES, osrmBodyFor, PHOTOS, RESULTS, RUN_ID, type Fixture,
} from '../../scripts/fixtures/approval-fixture'

type Repo = {
  files: Map<string, Uint8Array>       // working tree
  committed: Map<string, Uint8Array>   // committed blob per path
  tracked: Set<string>
  porcelainZ: string
  reads: string[]
}

const json = (v: unknown) => enc(`${JSON.stringify(v, null, 2)}\n`)

function makeRepo(edit?: (ctx: { records: Record<string, ApprovalRecord>; evidence: SharedEvidence; files: Map<string, Uint8Array> }) => void, fx: Fixture = FIXTURE): Repo {
  const evidence = makeEvidence()
  const records = Object.fromEntries(CORRIDORS.map((c) => [c.id, makeRecord(c.id, evidence, fx)]))
  const files = new Map<string, Uint8Array>([
    [GEO_PATH, enc(fx.geo.text)],
    [NOTES, enc('# Review notes\n')],
    [PHOTOS, enc('# Photo log\n')],
  ])
  edit?.({ records, evidence, files })
  for (const [id, rec] of Object.entries(records)) if (!files.has(approve.recordPath(id))) files.set(approve.recordPath(id), json(rec))
  if (!files.has(approve.EVIDENCE_PATH)) files.set(approve.EVIDENCE_PATH, json(evidence))
  return { files, committed: new Map(files), tracked: new Set(files.keys()), porcelainZ: '', reads: [] }
}

function run(repo: Repo) {
  const io = {
    readBytes: (p: string) => { repo.reads.push(p); return repo.files.get(p) ?? null },
    listDir: (dir: string) => {
      const names = [...repo.files.keys()].filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/')).map((p) => p.slice(dir.length + 1))
      return names.length ? names : null
    },
  }
  const git = {
    lsFiles: () => [...repo.tracked],
    statusPorcelainZ: () => repo.porcelainZ,
    lastCommit: (p: string) => (repo.tracked.has(p) ? 'c'.repeat(40) : null),
    showBlob: (_c: string, p: string) => repo.committed.get(p) ?? null,
    blobObjectId: (_c: string, p: string) => (repo.committed.has(p) ? 'b'.repeat(40) : null),
  }
  return approve.runApproval({ io, git })
}
const problems = (repo: Repo) => run(repo).problems.join('\n')

// ── Valid set ───────────────────────────────────────────────────────────────

describe('valid approval set', () => {
  it('fixture sanity: all five synthetic routes are NEEDS REVIEW (warnings to resolve), none FAILED', () => {
    expect(RESULTS.map((r) => gen.statusOf(r))).toEqual(Array(5).fill('NEEDS REVIEW'))
    for (const r of RESULTS) expect(r.warnings.map((w) => w.code)).toContain('campus-exit-unverified')
  })

  it('passes with exit 0 and reports hashes, integrity and the limits', () => {
    const res = run(makeRepo())
    expect(res.problems).toEqual([])
    expect(res.blockers).toEqual([])
    expect(res).toMatchObject({ ok: true, exitCode: 0, runId: RUN_ID, geojsonSha256: GEO.sha256 })
    expect(Object.keys(res.routes)).toEqual(CORRIDORS.map((c) => c.id))
    for (const r of RESULTS) expect(res.routes[r.id].routeGeometrySha256).toBe(r.routeGeometrySha256)
    expect(res.integrity.map((x) => x.path)).toEqual(expect.arrayContaining([...CORRIDORS.map((c) => approve.recordPath(c.id)), approve.EVIDENCE_PATH, GEO_PATH, PHOTOS]))
    expect(res.text).toContain(approve.HTTPS_LIMITATION)
    expect(res.limits).toEqual(approve.LIMITS)
  })

  it('classifies evidence: HTTPS is structural-only, committed repository files are blob-verified', () => {
    const res = run(makeRepo())
    const https = res.evidenceRefs.filter((e) => e.kind === 'https')
    expect(https.length).toBeGreaterThan(0)
    for (const e of https) expect(e.verification).toBe('structural-only')
    const photo = res.evidenceRefs.find((e) => e.ref === PHOTOS)!
    expect(photo).toMatchObject({ kind: 'repo', verification: 'committed-blob-verified', commitSha: 'c'.repeat(40), blobObjectId: 'b'.repeat(40), sha256: sha256Hex(enc('# Photo log\n')) })
    // Every HTTPS line in the report says structural-only; none claims to be verified.
    const httpsLines = res.text.split('\n').filter((l) => l.includes('[https'))
    expect(httpsLines.length).toBe(https.length)
    for (const l of httpsLines) {
      expect(l).toContain('[https: structural-only]')
      expect(l).not.toContain('committed-blob-verified')
    }
  })
})

// ── Records ─────────────────────────────────────────────────────────────────

describe('approval records', () => {
  it('fails when a record is missing', () => {
    const repo = makeRepo()
    repo.files.delete(approve.recordPath('tanauan'))
    expect(problems(repo)).toMatch(/missing approval record docs\/routes\/approvals\/alangilan\/tanauan.json/)
    expect(run(repo).exitCode).toBe(1)
  })

  it('fails when the records directory does not exist', () => {
    const repo = makeRepo()
    for (const c of CORRIDORS) repo.files.delete(approve.recordPath(c.id))
    expect(problems(repo)).toMatch(/approval records directory .* does not exist/)
  })

  it('fails on an extra file in the records directory', () => {
    const repo = makeRepo(({ files, records }) => { files.set(`${approve.APPROVALS_DIR}/pablo-borbon.json`, json(records.lipa)) })
    expect(problems(repo)).toMatch(/unexpected file in docs\/routes\/approvals\/alangilan: pablo-borbon.json/)
  })

  it('fails when a record routeId does not match its file name (duplicate route)', () => {
    const repo = makeRepo(({ files, records }) => { files.set(approve.recordPath('batangas'), json({ ...records.lipa })) })
    const p = problems(repo)
    expect(p).toMatch(/batangas.json: routeId "lipa" does not match its file name/)
    expect(p).toMatch(/duplicate record for route lipa/)
  })

  it('rejects a duplicate JSON key in a record, with its position', () => {
    const repo = makeRepo(({ files, records }) => {
      const text = JSON.stringify(records.bauan, null, 2).replace('"runId":', '"runId": "x",\n  "runId":')
      files.set(approve.recordPath('bauan'), enc(`${text}\n`))
    })
    expect(problems(repo)).toMatch(/bauan.json: Duplicate key "runId" at line \d+, column \d+/)
  })

  it.each([
    ['a byte-order mark', (b: Uint8Array) => Uint8Array.from([0xef, 0xbb, 0xbf, ...b]), /byte-order mark/],
    ['invalid UTF-8', (b: Uint8Array) => Uint8Array.from([...b.slice(0, 10), 0xff, ...b.slice(10)]), /not valid UTF-8/],
    ['a stray carriage return', (b: Uint8Array) => enc(new TextDecoder().decode(b).replace('\n', '\r ')), /carriage return/],
    ['malformed JSON', (b: Uint8Array) => b.slice(0, b.length - 3), /line \d+, column \d+/],
  ])('rejects a record with %s', (_label, mutate, message) => {
    const repo = makeRepo()
    const p = approve.recordPath('lipa')
    const bad = mutate(repo.files.get(p)!)
    repo.files.set(p, bad)
    repo.committed.set(p, bad)
    expect(problems(repo)).toMatch(message)
  })

  it('accepts a record committed with CRLF line endings (normalized record hash)', () => {
    const repo = makeRepo()
    const p = approve.recordPath('lipa')
    const crlf = enc(new TextDecoder().decode(repo.files.get(p)!).replace(/\n/g, '\r\n'))
    repo.files.set(p, crlf)
    repo.committed.set(p, crlf)
    expect(run(repo).ok).toBe(true)
  })

  it('rejects mismatched run IDs across records', () => {
    const repo = makeRepo(({ records }) => {
      records.bauan.runId = '20261202T000000Z-other1'
      records.bauan.resolutions = records.bauan.resolutions.map((r) => ({ ...r, runId: '20261202T000000Z-other1' }))
    })
    expect(problems(repo)).toMatch(/records cite 2 different diagnostic runs/)
  })

  it('rejects a record whose geojsonSha256 or routeGeometrySha256 does not match', () => {
    expect(problems(makeRepo(({ records }) => { records.lipa.geojsonSha256 = 'e'.repeat(64) }))).toMatch(/lipa.json: geojsonSha256 does not match the exact bytes/)
    const other = RESULTS.find((r) => r.id === 'bauan')!.routeGeometrySha256 as string
    expect(problems(makeRepo(({ records }) => {
      records.lipa.routeGeometrySha256 = other
      records.lipa.resolutions = records.lipa.resolutions.map((r) => ({ ...r, routeGeometrySha256: other }))
    }))).toMatch(/record lipa: routeGeometrySha256 does not match the geometry reproduced from the run/)
  })

  it('rejects a version mismatch in a record', () => {
    expect(problems(makeRepo(({ records }) => { records.lipa.routingPolicyVersion = 'rp-2' }))).toMatch(/routingPolicyVersion "rp-2" is not compatible/)
  })

  it('rejects altered warning values or text (not verbatim from the run)', () => {
    expect(problems(makeRepo(({ records }) => {
      const w = records.lipa.warnings[0]
      records.lipa.warnings[0] = { ...w, text: `${w.text} (edited)` }
    }))).toMatch(/is not copied verbatim from the diagnostic run/)
    expect(problems(makeRepo(({ records }) => {
      const w = records.lipa.warnings.find((x) => x.code === 'campus-exit-unverified')!
      w.value = { distanceM: -5, roads: [] }
    }))).toMatch(/value does not match the shape for campus-exit-unverified/)
  })

  it('an unresolved outcome blocks: exit 1, listed as a blocker', () => {
    const res = run(makeRepo(({ records }) => { records.bauan.resolutions[0].outcome = 'unresolved' }))
    expect(res.problems).toEqual([])
    expect(res.blockers.join('\n')).toMatch(/record bauan: .* is unresolved/)
    expect(res).toMatchObject({ ok: false, exitCode: 1 })
  })
})

// ── Endpoint warnings ───────────────────────────────────────────────────────

describe('endpoint warnings', () => {
  // Turn San Jose into a run with an endpoint-snap warning by snapping its destination 203 m away.
  const sjWarn = { code: 'endpoint-snap', text: 'endpoint snap 203 m > 150 m: the snapped destination needs human review', value: 203 }
  const withEndpointWarning = (edit: (res: ApprovalRecord['resolutions'][number]) => void) => makeRepo(({ records }) => {
    records.sanjose.warnings.unshift(sjWarn)
    const r = makeRecord('sanjose').resolutions.find((x) => x.warningCode === 'campus-exit-unverified')!
    const c = CORRIDORS.find((x) => x.id === 'sanjose')!
    const res = { ...r, warningCode: 'endpoint-snap', outcome: 'accepted-limitation', evidenceType: 'map-review', evidenceRef: NOTES,
      endpointRelationship: { requestedEndpoint: c.end, acceptedEndpoint: (RESULTS.find((x) => x.id === 'sanjose')!.snappedEnd as LatLng), separationM: haversineM(c.end, (RESULTS.find((x) => x.id === 'sanjose')!.snappedEnd as LatLng)), intendedDestination: 'Interchange', relationship: 'Nearest carriageway point.' } }
    delete (res as Partial<typeof res>).sharedEvidenceId
    delete (res as Partial<typeof res>).conditionsAcknowledged
    edit(res)
    records.sanjose.resolutions.unshift(res)
  })

  it('a warning the run does not report is rejected (records must copy the run exactly)', () => {
    expect(problems(withEndpointWarning(() => {}))).toMatch(/warning endpoint-snap is not reported by the diagnostic run/)
  })

  it('team-decision evidence cannot resolve an endpoint warning', () => {
    expect(problems(withEndpointWarning((r) => { r.evidenceType = 'team-decision' }))).toMatch(/team-decision cannot resolve endpoint-snap/)
  })

  it('the endpoint relationship is required and must match the configuration', () => {
    expect(problems(withEndpointWarning((r) => { delete r.endpointRelationship }))).toMatch(/endpointRelationship is required for endpoint-snap/)
    expect(problems(withEndpointWarning((r) => { r.endpointRelationship!.requestedEndpoint = [13.83, 121.12] }))).toMatch(/requestedEndpoint must equal the configured endpoint/)
  })
})

// ── Shared campus-exit evidence ─────────────────────────────────────────────

describe('shared campus-exit evidence', () => {
  it('fails when the evidence file is missing', () => {
    const repo = makeRepo()
    repo.files.delete(approve.EVIDENCE_PATH)
    repo.committed.delete(approve.EVIDENCE_PATH)
    repo.tracked.delete(approve.EVIDENCE_PATH)
    expect(problems(repo)).toMatch(/shared campus-exit evidence .* does not exist/)
  })

  it('fails on invalid evidence (missing finding)', () => {
    expect(problems(makeRepo(({ evidence }) => { evidence.usability.finding = '' }))).toMatch(/evidence: usability.finding is required/)
  })

  it.each([
    ['publicAccess', 'private'], ['publicAccess', 'restricted'], ['publicAccess', 'blocked'], ['publicAccess', 'unknown'],
    ['usability', 'unusable'], ['usability', 'unknown'],
  ] as const)('%s %s cannot be accepted (must stay unresolved)', (key, status) => {
    const res = run(makeRepo(({ evidence }) => { evidence[key] = { status, finding: 'Observed during inspection.' } }))
    expect(res.ok).toBe(false)
    expect(res.problems.join('\n')).toMatch(/does not establish public access and usability; the outcome must stay unresolved/)
  })

  it('a non-accepting exit recorded as unresolved is a blocker, not an approval', () => {
    const res = run(makeRepo(({ evidence, records }) => {
      evidence.publicAccess = { status: 'blocked', finding: 'Gate locked.' }
      for (const r of Object.values(records)) for (const x of r.resolutions) if (x.warningCode === 'campus-exit-unverified') x.outcome = 'unresolved'
    }))
    expect(res.problems).toEqual([])
    expect(res.blockers.join('\n')).toMatch(/does not establish public access and usability/)
    expect(res.exitCode).toBe(1)
  })
})

// ── Evidence references ─────────────────────────────────────────────────────

describe('evidence references', () => {
  it.each([
    ['a local absolute path', 'C:\\Users\\me\\photo.jpg', /local machine path/],
    ['plain http', 'http://example.org/photo', /only https:\/\/ URLs/],
    ['an untracked repository file', 'docs/routes/approvals/evidence/untracked.md', /is not a committed repository file/],
  ])('rejects %s in the shared evidence', (_label, ref, message) => {
    const repo = makeRepo(({ evidence, files }) => {
      evidence.evidenceRefs = [ref]
      if (!ref.includes(':')) files.set(ref, enc('x'))
    })
    if (!ref.includes(':')) { repo.tracked.delete(ref); repo.committed.delete(ref); repo.porcelainZ = `?? ${ref}\0` }
    const res = run(repo)
    expect(res.problems.join('\n')).toMatch(message)
    expect(res.evidenceRefs.find((e) => e.ref === ref)?.kind).toBe('invalid')
  })

  it('rejects a modified (uncommitted) repository evidence file', () => {
    const repo = makeRepo()
    repo.porcelainZ = ` M ${PHOTOS}\0`
    const p = problems(repo)
    expect(p).toMatch(/is not a committed repository file/)
  })

  it('rejects an invalid resolution evidenceRef', () => {
    expect(problems(makeRepo(({ records }) => { records.bauan.resolutions[0].evidenceRef = '/home/me/notes.md' }))).toMatch(/evidenceRef: local machine path/)
  })
})

// ── Git integrity ───────────────────────────────────────────────────────────

describe('Git working-tree integrity', () => {
  it.each([
    ['modified', ' M', /has unstaged changes/],
    ['staged', 'M ', /has staged changes/],
    ['untracked', '??', /is untracked/],
  ])('rejects a %s approval record', (_label, status, message) => {
    const repo = makeRepo()
    const p = approve.recordPath('lipa')
    repo.porcelainZ = `${status} ${p}\0`
    if (status === '??') repo.tracked.delete(p)
    expect(problems(repo)).toMatch(message)
  })

  it('rejects a modified evidence file', () => {
    const repo = makeRepo()
    repo.porcelainZ = ` M ${approve.EVIDENCE_PATH}\0`
    expect(problems(repo)).toMatch(/alangilan-campus-exit.json has unstaged changes/)
  })

  it('rejects a record whose working copy differs from its committed version', () => {
    const repo = makeRepo()
    const p = approve.recordPath('lipa')
    repo.committed.set(p, enc(new TextDecoder().decode(repo.files.get(p)!).replace('Project team', 'Someone else')))
    expect(problems(repo)).toMatch(/lipa.json: working copy differs from the committed version/)
  })
})

// ── Diagnostic GeoJSON (Option A) ───────────────────────────────────────────

describe('diagnostic GeoJSON', () => {
  it('fails when the GeoJSON is missing', () => {
    const repo = makeRepo()
    repo.files.delete(GEO_PATH); repo.committed.delete(GEO_PATH); repo.tracked.delete(GEO_PATH)
    expect(problems(repo)).toMatch(/diagnostic GeoJSON .* does not exist/)
  })

  it('fails when the GeoJSON exists but is not committed', () => {
    const repo = makeRepo()
    repo.tracked.delete(GEO_PATH); repo.committed.delete(GEO_PATH); repo.porcelainZ = `?? ${GEO_PATH}\0`
    expect(problems(repo)).toMatch(/is not committed \(the diagnostic GeoJSON must be tracked, committed and unmodified\)/)
  })

  it('fails when the GeoJSON is modified or staged', () => {
    const modified = makeRepo(); modified.porcelainZ = ` M ${GEO_PATH}\0`
    expect(problems(modified)).toMatch(/has unstaged changes/)
    const staged = makeRepo(); staged.porcelainZ = `M  ${GEO_PATH}\0`
    expect(problems(staged)).toMatch(/has staged changes/)
  })

  it('fails when one byte differs (working copy vs committed, or vs the recorded hash)', () => {
    const changed = enc(GEO.text.replace('"runId"', '"runId" '))
    const vsBlob = makeRepo(); vsBlob.files.set(GEO_PATH, changed)
    expect(problems(vsBlob)).toMatch(/working copy bytes differ from the committed blob/)
    const vsHash = makeRepo(); vsHash.files.set(GEO_PATH, changed); vsHash.committed.set(GEO_PATH, changed)
    expect(problems(vsHash)).toMatch(/geojsonSha256 does not match the exact bytes/)
  })

  it('fails on a CRLF-converted copy (bytes are never normalized)', () => {
    const crlf = enc(GEO.text.replace(/\n/g, '\r\n'))
    const repo = makeRepo(); repo.files.set(GEO_PATH, crlf); repo.committed.set(GEO_PATH, crlf)
    expect(problems(repo)).toMatch(/geojsonSha256 does not match the exact bytes/)
  })

  it('rejects an older-format run (no versions or structured warnings), even with matching hashes', () => {
    const old = JSON.parse(GEO.text)
    delete old.biyahe.versions
    for (const f of old.features) delete f.properties.warnings
    const text = `${JSON.stringify(old, null, 1)}\n`
    const hash = sha256Hex(enc(text))
    const repo = makeRepo(({ records, files }) => {
      files.set(GEO_PATH, enc(text))
      for (const r of Object.values(records)) r.geojsonSha256 = hash
    })
    const p = problems(repo)
    expect(p).toMatch(/versions is missing or incomplete/)
    expect(p).toMatch(/no structured warnings \(older run format\)/)
  })

  it('rejects geometry that does not reproduce from the raw OSRM geometry (tampered file, consistent hashes)', () => {
    const tampered = JSON.parse(GEO.text)
    const simp = tampered.features.find((f: { properties: Record<string, unknown> }) => f.properties.kind === 'route-simplified' && f.properties.corridorId === 'bauan')
    simp.geometry.coordinates[2][0] += 0.0001
    const raw = tampered.features.find((f: { properties: Record<string, unknown> }) => f.properties.kind === 'route-raw' && f.properties.corridorId === 'lipa')
    raw.properties.routeGeometrySha256 = 'd'.repeat(64)
    const text = `${JSON.stringify(tampered, null, 1)}\n`
    const hash = sha256Hex(enc(text))
    const repo = makeRepo(({ records, files }) => {
      files.set(GEO_PATH, enc(text))
      for (const r of Object.values(records)) r.geojsonSha256 = hash
    })
    const p = problems(repo)
    expect(p).toMatch(/bauan: stored route-simplified does not match the recomputed path/)
    expect(p).toMatch(/lipa: stored routeGeometrySha256 does not match the recomputed application path/)
  })

  it('rejects a stored FAILED label that the recomputed analysis does not produce', () => {
    const failed = JSON.parse(GEO.text)
    for (const f of failed.features) if (f.properties.corridorId === 'tanauan') f.properties.validation = 'FAILED'
    const text = `${JSON.stringify(failed, null, 1)}\n`
    const hash = sha256Hex(enc(text))
    const repo = makeRepo(({ records, files }) => {
      files.set(GEO_PATH, enc(text))
      for (const r of Object.values(records)) r.geojsonSha256 = hash
    })
    expect(problems(repo)).toMatch(/tanauan: stored status "FAILED" does not match the recomputed status/)
  })

  it('rejects a GeoJSON whose run ID differs from the records', () => {
    const other = JSON.parse(GEO.text)
    other.biyahe.runId = 'SOMETHING-ELSE'
    const text = `${JSON.stringify(other, null, 1)}\n`
    const hash = sha256Hex(enc(text))
    const repo = makeRepo(({ records, files }) => { files.set(GEO_PATH, enc(text)); for (const r of Object.values(records)) r.geojsonSha256 = hash })
    expect(problems(repo)).toMatch(/biyahe.runId "SOMETHING-ELSE" does not match the records' run/)
  })
})

// ── Fail-closed behaviour and read-only guarantee ───────────────────────────

describe('fail-closed and read-only', () => {
  it('an exception inside any stage is caught and reported with exit 1', () => {
    const repo = makeRepo()
    const res = approve.runApproval({
      io: { readBytes: () => { throw new Error('disk error') }, listDir: () => CORRIDORS.map((c) => `${c.id}.json`) },
      git: { lsFiles: () => [...repo.tracked], statusPorcelainZ: () => '', lastCommit: () => 'c'.repeat(40), showBlob: () => null, blobObjectId: () => null },
    })
    expect(res).toMatchObject({ ok: false, exitCode: 1 })
    expect(res.problems.join('\n')).toMatch(/internal error: disk error/)
  })

  it('an empty repository (no records yet) is rejected with exit 1', () => {
    const repo: Repo = { files: new Map(), committed: new Map(), tracked: new Set(), porcelainZ: '', reads: [] }
    const res = run(repo)
    expect(res.exitCode).toBe(1)
    expect(res.problems.join('\n')).toMatch(/approval records directory .* does not exist/)
  })

  it('the I/O it is given can only read; it reads only expected repository paths', () => {
    const repo = makeRepo()
    run(repo)
    const allowed = new Set([...CORRIDORS.map((c) => approve.recordPath(c.id)), approve.EVIDENCE_PATH, GEO_PATH, PHOTOS, NOTES])
    for (const p of repo.reads) expect(allowed.has(p), p).toBe(true)
  })

  it('the script imports no file-writing API and never imports the generator\'s writer', () => {
    const fsImport = approveSource.match(/import \{([^}]*)\} from 'node:fs'/)?.[1].split(',').map((s) => s.trim()).filter(Boolean)
    expect(fsImport).toEqual(['readdirSync', 'readFileSync'])
    for (const writer of ['writeFile', 'writeSync', 'renameSync', 'rmSync', 'unlink', 'mkdirSync', 'openSync', 'appendFile', 'copyFile', 'promote(']) {
      expect(approveSource, writer).not.toContain(writer)
    }
  })

  it('preflight refuses outside npm run routes:approve, without Git, or in another repository', () => {
    expect(approve.preflightProblems({ lifecycleEvent: 'routes:approve', gitTopLevel: '/repo', scriptRoot: '/repo' })).toEqual([])
    expect(approve.preflightProblems({ lifecycleEvent: undefined, gitTopLevel: '/repo', scriptRoot: '/repo' }).join('\n')).toMatch(/npm run routes:approve/)
    expect(approve.preflightProblems({ lifecycleEvent: 'routes:approve', gitTopLevel: null, scriptRoot: '/repo' }).join('\n')).toMatch(/Git is not available/)
    expect(approve.preflightProblems({ lifecycleEvent: 'routes:approve', gitTopLevel: '/other', scriptRoot: '/repo' }).join('\n')).toMatch(/is not this repository/)
  })
})

// ── Step 4 remediation: re-analysis from the diagnostic's raw OSRM data (C1) ─
// Every tamper below recomputes the GeoJSON hash and updates the records, so integrity checks pass and only
// the re-analysis can catch it.

type Geo = { biyahe: Record<string, unknown>; features: { geometry: { coordinates: unknown } | null; properties: Record<string, unknown> }[] }
const feature = (g: Geo, id: string, kind: string) => g.features.find((f) => f.properties.corridorId === id && f.properties.kind === kind)!
function tamperedRepo(mutate: (g: Geo, records: Record<string, ApprovalRecord>) => void, fx: Fixture = FIXTURE): Repo {
  const g = JSON.parse(fx.geo.text) as Geo
  return makeRepo(({ records, files }) => {
    mutate(g, records)
    const text = `${JSON.stringify(g, null, 1)}\n`
    files.set(GEO_PATH, enc(text))
    for (const r of Object.values(records)) r.geojsonSha256 = sha256Hex(enc(text))
  }, fx)
}

// A genuinely FAILED San Jose route: OSRM's reported distance is twice the geometry length.
const FAILED_FX = (() => {
  const body = osrmBodyFor('sanjose')
  body.routes[0].distance *= 2
  return makeFixture({ sanjose: body })
})()

// San Jose with its destination snapped 203 m from the configured endpoint (the real-world case).
const SJ203_FX = makeFixture({ sanjose: osrmBodyFor('sanjose', 203) })

describe('re-analysis: stored analysis must equal the recomputed analysis', () => {
  it('rejects a warning removed from the diagnostic and from the records', () => {
    const repo = tamperedRepo((g, records) => {
      const raw = feature(g, 'lipa', 'route-raw')
      raw.properties.warnings = (raw.properties.warnings as { code: string }[]).filter((w) => w.code !== 'campus-exit-unverified')
      records.lipa.warnings = records.lipa.warnings.filter((w) => w.code !== 'campus-exit-unverified')
      records.lipa.resolutions = records.lipa.resolutions.filter((r) => r.warningCode !== 'campus-exit-unverified')
    })
    const res = run(repo)
    expect(res.ok).toBe(false)
    expect(res.problems.join('\n')).toMatch(/lipa: stored warnings do not match the recomputed warnings/)
    // The records are checked against the recomputed analysis, which still reports the warning.
    expect(res.problems.join('\n')).toMatch(/record lipa: .*campus-exit-unverified/)
  })

  it('a genuinely FAILED route is reproduced as FAILED and cannot be approved', () => {
    expect(gen.statusOf(FAILED_FX.results.find((r) => r.id === 'sanjose')!)).toBe('FAILED')
    const res = run(makeRepo(undefined, FAILED_FX))
    expect(res.exitCode).toBe(1)
    expect(res.problems.join('\n')).toMatch(/record sanjose: .*FAILED route cannot be approved/)
    expect(res.routes.sanjose.status).toBe('FAILED')
  })

  it('rejects a FAILED route relabelled NEEDS REVIEW (failures removed too)', () => {
    const repo = tamperedRepo((g) => {
      for (const f of g.features) if (f.properties.corridorId === 'sanjose') f.properties.validation = 'NEEDS REVIEW'
      const raw = feature(g, 'sanjose', 'route-raw')
      if ('failures' in raw.properties) raw.properties.failures = []
    }, FAILED_FX)
    const p = problems(repo)
    expect(p).toMatch(/sanjose: stored status "NEEDS REVIEW" does not match the recomputed status "FAILED"/)
    expect(p).toMatch(/record sanjose: .*FAILED route cannot be approved/)
  })

  it('rejects an unknown status', () => {
    const repo = tamperedRepo((g) => { for (const f of g.features) if (f.properties.corridorId === 'bauan') f.properties.validation = 'OK' })
    const res = run(repo)
    expect(res.exitCode).toBe(1)
    expect(res.problems.join('\n')).toMatch(/bauan: unknown status "OK"/)
    // verifyDiagnosticRoute applies the same allow-list on its own
    const g = JSON.parse(GEO.text) as Geo
    feature(g, 'bauan', 'route-raw').properties.validation = 'OK'
    expect(gen.verifyDiagnosticRoute(g, CORRIDORS.find((c) => c.id === 'bauan')!).problems.join('\n')).toMatch(/bauan: unknown stored status "OK"/)
  })

  it('rejects a changed warning value (records changed to match)', () => {
    const repo = tamperedRepo((g, records) => {
      const w = (feature(g, 'tanauan', 'route-raw').properties.warnings as { value: unknown }[])[0]
      w.value = 1
      records.tanauan.warnings[0].value = 1
    })
    expect(problems(repo)).toMatch(/tanauan: stored warnings do not match the recomputed warnings/)
  })

  it('an edited exact step distance changes the recomputed analysis and is rejected', () => {
    const edit = (g: Geo) => {
      const s = g.features.find((f) => f.properties.corridorId === 'lipa' && f.properties.kind === 'step' && f.properties.index === 1)!
      s.properties.osrmDistanceM = 10
    }
    const g = JSON.parse(GEO.text) as Geo
    edit(g)
    const recomputed = gen.reanalyseFromDiagnostic(g, CORRIDORS.find((x) => x.id === 'lipa')!)
    expect(recomputed.warnings).not.toEqual(RESULTS.find((r) => r.id === 'lipa')!.warnings)
    const p = problems(tamperedRepo((t) => edit(t)))
    expect(p).toMatch(/lipa: stored warnings do not match the recomputed warnings/)
    expect(p).toMatch(/lipa: step\[1\]\.distanceM does not match the recomputed analysis/)
  })

  it('rejects any other stored derived value that differs (feature-level comparison)', () => {
    const repo = tamperedRepo((g) => { feature(g, 'batangas', 'route-raw').properties.primaryShare = 0.99 })
    expect(problems(repo)).toMatch(/batangas: route-raw\.primaryShare does not match the recomputed analysis/)
  })

  it.each([
    ['missing osrmLocation', (g: Geo) => { delete feature(g, 'bauan', 'snapped-end').properties.osrmLocation }, /bauan: cannot rebuild .*snapped-end\.osrmLocation is missing/],
    ['missing osrmName', (g: Geo) => { delete feature(g, 'bauan', 'snapped-start').properties.osrmName }, /bauan: cannot rebuild .*snapped-start\.osrmName is missing/],
    ['missing step osrmDistanceM', (g: Geo) => { delete feature(g, 'bauan', 'step').properties.osrmDistanceM }, /bauan: cannot rebuild .*step\[0\]\.osrmDistanceM is missing/],
    ['a step index gap', (g: Geo) => { feature(g, 'bauan', 'step').properties.index = 5 }, /bauan: cannot rebuild .*step indexes must be 0\.\.1 in order/],
    ['an ill-typed route distance', (g: Geo) => { feature(g, 'bauan', 'route-raw').properties.osrmDistanceM = '100' }, /bauan: cannot rebuild .*route-raw\.osrmDistanceM must be a finite number/],
    ['a duplicate snapped-end', (g: Geo) => { g.features.push(structuredClone(feature(g, 'bauan', 'snapped-end'))) }, /bauan: duplicate route features/],
    ['a duplicate snapped-start', (g: Geo) => { g.features.push(structuredClone(feature(g, 'bauan', 'snapped-start'))) }, /bauan: cannot rebuild .*exactly one snapped-start feature, found 2/],
    ['no diagnostic schema version (older diagnostic)', (g: Geo) => { delete g.biyahe.diagnosticSchemaVersion }, /diagnosticSchemaVersion is null, expected ds-1/],
  ])('rejects %s', (_label, mutate, message) => {
    const res = run(tamperedRepo((g) => mutate(g)))
    expect(res.exitCode).toBe(1)
    expect(res.problems.join('\n')).toMatch(message)
  })

  it('rejects a routing policy in the diagnostic that differs from this code', () => {
    const repo = tamperedRepo((g) => { (g.biyahe.routingPolicy as Record<string, unknown>).profile = 'foot' })
    expect(problems(repo)).toMatch(/biyahe\.routingPolicy does not match the routing policy of this code/)
  })
})

describe('re-analysis: valid diagnostics reproduce their own analysis exactly (whole result)', () => {
  // The complete analyse() result object is compared; nothing is excluded. Any analyse() input that the
  // diagnostic does not carry exactly would make this fail.
  it.each([
    ['five synthetic corridors', FIXTURE],
    ['San Jose snapped 203 m from the configured endpoint', SJ203_FX],
    ['a FAILED route', FAILED_FX],
  ])('%s', (_label, fx) => {
    const g = JSON.parse(fx.geo.text)
    for (const c of CORRIDORS) {
      const original = fx.results.find((r) => r.id === c.id)!
      expect(JSON.parse(JSON.stringify(gen.reanalyseFromDiagnostic(g, c)))).toEqual(JSON.parse(JSON.stringify(original)))
      expect(gen.verifyDiagnosticRoute(g, c).problems).toEqual([])
    }
  })

  it('the diagnostic carries the exact raw values (not the rounded display values)', () => {
    const g = JSON.parse(SJ203_FX.geo.text) as Geo
    expect(g.biyahe.diagnosticSchemaVersion).toBe('ds-1')
    const body = osrmBodyFor('sanjose', 203)
    const end = feature(g, 'sanjose', 'snapped-end')
    expect(end.properties.osrmLocation).toEqual(body.waypoints[1].location)
    expect(end.properties.osrmName).toBe(body.waypoints[1].name)
    expect(end.geometry!.coordinates).not.toEqual(body.waypoints[1].location) // the point geometry is rounded
    const steps = g.features.filter((f) => f.properties.corridorId === 'sanjose' && f.properties.kind === 'step')
    expect(steps.map((s) => s.properties.osrmDistanceM)).toEqual(body.routes[0].legs[0].steps.map((s) => s.distance))
  })
})

describe('San Jose end to end (203 m snapped endpoint)', () => {
  const CODES = ['campus-exit-unverified', 'endpoint-snap', 'endpoint-zone-not-reached', 'snap-bearing-applied']

  it('reports the expected warnings and passes with exit 0 when both endpoint warnings are resolved', () => {
    const sj = SJ203_FX.results.find((r) => r.id === 'sanjose')!
    expect(sj.warnings.map((w) => w.code).sort()).toEqual(CODES)
    const res = run(makeRepo(undefined, SJ203_FX))
    expect(res.problems).toEqual([])
    expect(res.blockers).toEqual([])
    expect(res).toMatchObject({ ok: true, exitCode: 0 })
    expect([...res.routes.sanjose.warnings].sort()).toEqual(CODES)
  })

  it('a wrong accepted endpoint is rejected against the recomputed snapped end', () => {
    const repo = makeRepo(({ records }) => {
      for (const r of records.sanjose.resolutions) if (r.endpointRelationship) r.endpointRelationship.acceptedEndpoint = CORRIDORS.find((c) => c.id === 'sanjose')!.end
    }, SJ203_FX)
    expect(problems(repo)).toMatch(/acceptedEndpoint/)
  })
})

describe('evidence references are checked once and invalid ones always fail', () => {
  it('a repeated reference reuses the first result, including a failure', () => {
    const repo = makeRepo(({ evidence }) => { evidence.evidenceRefs = [PHOTOS, PHOTOS] })
    repo.committed.delete(PHOTOS)
    const res = run(repo)
    const photos = res.evidenceRefs.filter((e) => e.ref === PHOTOS)
    expect(photos).toHaveLength(2)
    for (const e of photos) expect(e.verification).toBe('failed')
    expect(res.ok).toBe(false)
    expect(res.text).not.toContain('see first occurrence')
  })

  it('an invalid reference in the shared evidence file fails the run, reported once', () => {
    const repo = makeRepo(({ evidence }) => { evidence.evidenceRefs = ['https://example.org/x', 'docs/other/photos.md'] })
    const res = run(repo)
    expect(res.exitCode).toBe(1)
    expect(res.problems.filter((p) => p.includes('docs/other/photos.md is outside the allowed evidence paths'))).toHaveLength(1)
  })
})

describe('real Git access (arguments only; no Git process is started)', () => {
  type Call = { file: string; args: string[]; opts: { cwd: string; encoding: string } }
  const fakeGit = (out: (args: string[]) => Uint8Array) => {
    const calls: Call[] = []
    const exec = ((file: string, args: string[], opts: Call['opts']) => { calls.push({ file, args, opts }); return out(args) }) as unknown as approve.GitExec
    return { calls, git: approve.realGit('/repo', exec) }
  }

  it('status uses --no-optional-locks and porcelain v1 -z with all untracked files', () => {
    const { calls, git } = fakeGit(() => enc(''))
    git.statusPorcelainZ()
    expect(calls[0]).toMatchObject({ file: 'git', args: ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], opts: { cwd: '/repo', encoding: 'buffer' } })
  })

  it('blobs are read with git cat-file blob as raw bytes (CRLF and non-UTF-8 bytes preserved)', () => {
    const bytes = new Uint8Array([0x7b, 0x0d, 0x0a, 0xff, 0x7d])
    const { calls, git } = fakeGit(() => bytes)
    expect([...git.showBlob('a'.repeat(40), 'docs/routes/x.geojson')!]).toEqual([...bytes])
    expect(calls[0].args).toEqual(['cat-file', 'blob', `${'a'.repeat(40)}:docs/routes/x.geojson`])
    expect(calls[0].opts.encoding).toBe('buffer')
  })

  it('a failing git command yields null, not an exception', () => {
    const { git } = fakeGit(() => { throw new Error('fatal') })
    expect(git.showBlob('a', 'b')).toBeNull()
    expect(git.lastCommit('b')).toBeNull()
  })
})
