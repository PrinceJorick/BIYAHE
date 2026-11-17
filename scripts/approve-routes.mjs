#!/usr/bin/env node
// BIYAHE route approval validator — DEVELOPER-ONLY and VALIDATE-ONLY. Run only with:  npm run routes:approve
// (the npm script runs the route-check, version and approval tests first; this script refuses otherwise).
//
// Validates the committed human approval records for the five Alangilan routes against the committed
// diagnostic GeoJSON of one run, then prints a report and exits 0 (complete, no blockers) or 1.
// It NEVER writes a file: the I/O it receives can only read. Generating application road data is a later
// step (Step 5) and is not implemented here.
//
// What it checks: Git cleanliness and committed-blob integrity of every record, evidence file, repository
// evidence reference and the diagnostic GeoJSON; strict JSON (duplicate keys rejected); the GeoJSON's exact
// bytes against the recorded SHA-256; the diagnostic schema (ds-1) and versions; the complete route analysis
// RE-RUN from the diagnostic's raw OSRM data with the generator's own analyse() (stored statuses, warnings,
// hashes, paths and metrics must all match); and the full approval set (warnings, resolutions, endpoint
// relationships, shared campus-exit evidence) against that recomputed analysis.
// What it cannot check: that the raw OSRM data itself is genuine (re-analysis proves consistency with the
// stored raw data, not its provenance), that an on-site inspection happened, that recorded findings are
// true, or the content of HTTPS references (checked for form only; no network request is made).

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  classifyEvidenceRef, CORRIDORS, extractRunFromGeoJSON, geojsonSha256, parsePorcelainZ, parseStrictJson,
  recordSha256, sha256Hex, validateApprovalSet, validateCleanTracked,
} from '../src/lib/routeChecks.js'
import { DIAGNOSTIC_MARK, routingPolicyParams, STATUS, statusOf, verifyDiagnosticRoute } from './build-routes.mjs'

// ── Paths (repo-relative, POSIX separators) ─────────────────────────────────

export const APPROVALS_DIR = 'docs/routes/approvals/alangilan'
export const EVIDENCE_PATH = 'docs/routes/approvals/evidence/alangilan-campus-exit.json'
export const DIAGNOSTICS_DIR = 'docs/routes/diagnostics'
export const diagnosticGeoJsonPath = (runId) => `${DIAGNOSTICS_DIR}/alangilan-candidates.DIAGNOSTIC.${runId}.geojson`
export const recordPath = (routeId) => `${APPROVALS_DIR}/${routeId}.json`

export const HTTPS_LIMITATION = 'HTTPS references were checked for form only; this script made no network request and has not verified their availability or content. Reviewers must open them.'
export const RAW_DATA_LIMITATION = 'The route analysis is re-run from the raw OSRM data stored in the committed diagnostic; this proves the stored results are consistent with that raw data, not that the raw data is genuine OSRM output. The trust boundary is the reviewed, committed diagnostic.'
export const LIMITS = [
  'This script cannot verify that an on-site inspection happened or that recorded findings are true; human review of the records remains necessary.',
  RAW_DATA_LIMITATION,
  HTTPS_LIMITATION,
  'Validate-only: no application road data is generated (that is a later step).',
]

// ── Core (pure apart from the injected read-only I/O and Git) ───────────────
// io:  { readBytes(path) → Uint8Array | null, listDir(path) → string[] | null }   (read-only by construction)
// git: { lsFiles() → string[], statusPorcelainZ() → string, lastCommit(path) → string | null,
//        showBlob(commit, path) → Uint8Array | null, blobObjectId(commit, path) → string | null }

export function runApproval({ io, git, corridors = CORRIDORS }) {
  const problems = []
  const integrity = []
  const evidenceRefs = []
  const routes = {}
  let validation = null
  let runId = null
  let geojsonHash = null
  const add = (msg) => problems.push(msg)

  try {
    // 1. Git snapshot: committed = tracked and without any porcelain entry.
    const trackedFiles = git.lsFiles()
    const porcelainZ = git.statusPorcelainZ()
    const changed = new Set(parsePorcelainZ(porcelainZ).map((c) => c.path))
    const committedFiles = new Set(trackedFiles.filter((p) => !changed.has(p)))
    const snapshot = { trackedFiles, porcelainZ }

    // Committed-blob integrity. Every mode requires the path to be tracked with no Git status entry.
    //   'record' — approval record / evidence JSON: working and committed text must have the same normalized
    //              record hash (CRLF→LF; BOM, invalid UTF-8 and lone CR rejected).
    //   'bytes'  — diagnostic GeoJSON: working bytes must equal the committed blob bytes exactly.
    //   'blob'   — repository evidence file: Git's clean status vouches for the working copy; the committed
    //              blob bytes are hashed for the report (a CRLF checkout of a text file is not a failure).
    const verifyCommitted = (path, mode) => {
      const clean = validateCleanTracked(snapshot, [path])
      if (!clean.clean) { clean.problems.forEach(add); return null }
      const bytes = io.readBytes(path)
      if (!bytes) { add(`${path} is missing from the working tree`); return null }
      const commit = git.lastCommit(path)
      const blob = commit ? git.showBlob(commit, path) : null
      if (!commit || !blob) { add(`${path}: no committed version found`); return null }
      const row = { path, commitSha: commit, blobSha256: sha256Hex(blob) }
      if (mode === 'blob') {
        integrity.push(row)
        return blob
      }
      if (mode === 'record') {
        let workingHash
        try { workingHash = recordSha256(bytes) } catch (e) { add(`${path}: ${e.message}`); return null }
        let blobHash
        try { blobHash = recordSha256(blob) } catch (e) { add(`${path} (committed): ${e.message}`); return null }
        if (workingHash !== blobHash) { add(`${path}: working copy differs from the committed version`); return null }
        row.recordSha256 = workingHash
      } else if (sha256Hex(bytes) !== row.blobSha256) {
        add(`${path}: working copy bytes differ from the committed blob`)
        return null
      }
      integrity.push(row)
      return bytes
    }

    const parseRecordBytes = (path, bytes) => {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n/g, '\n')
        return parseStrictJson(text)
      } catch (e) {
        add(`${path}: ${e.message}`)
        return undefined
      }
    }

    // 2. Records: exactly the five configured route files, nothing else in the directory.
    const expected = corridors.map((c) => `${c.id}.json`)
    const listing = io.listDir(APPROVALS_DIR)
    if (!listing) add(`approval records directory ${APPROVALS_DIR} does not exist`)
    for (const name of listing ?? []) if (!expected.includes(name)) add(`unexpected file in ${APPROVALS_DIR}: ${name}`)
    const records = []
    for (const c of corridors) {
      const path = recordPath(c.id)
      if (listing && !listing.includes(`${c.id}.json`)) { add(`missing approval record ${path}`); continue }
      if (!listing) continue
      const bytes = verifyCommitted(path, 'record')
      if (!bytes) continue
      const rec = parseRecordBytes(path, bytes)
      if (rec === undefined) continue
      if (rec?.routeId !== c.id) add(`${path}: routeId ${JSON.stringify(rec?.routeId)} does not match its file name`)
      records.push(rec)
    }

    // 3. Shared campus-exit evidence.
    let evidence = null
    if (!trackedFiles.includes(EVIDENCE_PATH) && io.readBytes(EVIDENCE_PATH) === null) {
      add(`shared campus-exit evidence ${EVIDENCE_PATH} does not exist`)
    } else {
      const bytes = verifyCommitted(EVIDENCE_PATH, 'record')
      if (bytes) evidence = parseRecordBytes(EVIDENCE_PATH, bytes) ?? null
    }

    // 4. One diagnostic run, its GeoJSON committed and byte-exact.
    const runIds = [...new Set(records.map((r) => r?.runId))]
    if (records.length && runIds.length !== 1) add(`records cite ${runIds.length} different diagnostic runs: ${runIds.join(', ')}`)
    let run = null
    let geo
    if (runIds.length === 1 && typeof runIds[0] === 'string' && /^[A-Za-z0-9-]+$/.test(runIds[0])) {
      runId = runIds[0]
      const geoPath = diagnosticGeoJsonPath(runId)
      if (!trackedFiles.includes(geoPath)) {
        add(io.readBytes(geoPath) ? `${geoPath} is not committed (the diagnostic GeoJSON must be tracked, committed and unmodified)` : `diagnostic GeoJSON ${geoPath} does not exist`)
      } else {
        const bytes = verifyCommitted(geoPath, 'bytes')
        if (bytes) {
          geojsonHash = geojsonSha256(bytes)
          for (const r of records) if (r?.geojsonSha256 !== geojsonHash) add(`${recordPath(r?.routeId)}: geojsonSha256 does not match the exact bytes of ${geoPath}`)
          try { geo = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch (e) { add(`${geoPath}: ${e.message}`) }
          if (geo) {
            if (!String(geo.biyahe?.status ?? '').startsWith(DIAGNOSTIC_MARK)) add(`${geoPath}: not a BIYAHE diagnostic GeoJSON`)
            if (geo.biyahe?.runId !== runId) add(`${geoPath}: biyahe.runId ${JSON.stringify(geo.biyahe?.runId)} does not match the records' run ${runId}`)
            const extracted = extractRunFromGeoJSON(geo, geojsonHash, corridors.map((c) => c.id), { allowedStatuses: Object.values(STATUS) })
            extracted.problems.forEach((p) => add(`${geoPath}: ${p}`))
            run = extracted.run
          }
        }
      }
    } else if (runIds.length === 1) {
      add(`records cite an invalid run ID ${JSON.stringify(runIds[0])}`)
    }

    // 5. Re-run the route analysis for every route from the diagnostic's raw OSRM data, with the generator's
    //    own analyse() (shared gp-1 processing, warning rules and thresholds). Every stored status, warning,
    //    hash, path and metric must equal the recomputed one; records are then validated against the
    //    RECOMPUTED analysis, never against stored claims.
    let recomputedRun = null
    if (run) {
      if (JSON.stringify(geo.biyahe?.routingPolicy) !== JSON.stringify(routingPolicyParams())) {
        add(`${diagnosticGeoJsonPath(runId)}: biyahe.routingPolicy does not match the routing policy of this code`)
      }
      const recomputedRoutes = {}
      for (const c of corridors) {
        const { result: r, problems: routeProblems } = verifyDiagnosticRoute(geo, c)
        routeProblems.forEach(add)
        if (!r) continue
        const status = statusOf(r)
        recomputedRoutes[c.id] = { status, warnings: r.warnings, routeGeometrySha256: r.routeGeometrySha256, snappedEnd: r.snappedEnd ?? null }
        routes[c.id] = { status, routeGeometrySha256: r.routeGeometrySha256, points: r.appPath ? r.appPath.length : 0, warnings: r.warnings.map((w) => w.code) }
      }
      if (Object.keys(recomputedRoutes).length === corridors.length) {
        recomputedRun = { runId: run.runId, geojsonSha256: geojsonHash, versions: run.versions, routes: recomputedRoutes }
      } else {
        add('the route analysis could not be recomputed for every route; the approval set cannot be validated against the run')
      }
    }

    // 6. Full approval set (local mode), against the recomputed analysis only.
    validation = validateApprovalSet({
      records, evidence, corridors, committedFiles, mode: 'local', run: recomputedRun ?? undefined,
    })
    validation.problems.forEach(add)

    // 7. Evidence references: classification, and committed-blob verification for repository files. Each
    //    distinct reference is checked once; repeated occurrences reuse that result (including a failure).
    //    Invalid references in the shared evidence file always fail, even if no route relies on it.
    const refs = [
      ...((evidence?.evidenceRefs) ?? []).map((ref) => ({ ref, source: EVIDENCE_PATH })),
      ...records.flatMap((r) => (Array.isArray(r?.resolutions) ? r.resolutions : []).map((res) => ({ ref: res?.evidenceRef, source: `${recordPath(r?.routeId)} (${res?.warningCode})` }))),
    ]
    const checked = new Map()
    for (const { ref, source } of refs) {
      const key = typeof ref === 'string' ? ref : JSON.stringify(ref)
      if (!checked.has(key)) {
        const c = classifyEvidenceRef(ref, committedFiles)
        const outcome = { kind: c.kind }
        if (c.kind === 'https') outcome.verification = 'structural-only'
        else if (c.kind === 'repo') {
          const bytes = verifyCommitted(ref, 'blob')
          if (bytes) {
            const row = integrity.find((x) => x.path === ref)
            outcome.verification = 'committed-blob-verified'
            outcome.commitSha = row.commitSha
            outcome.blobObjectId = git.blobObjectId(row.commitSha, ref)
            outcome.sha256 = row.blobSha256
          } else {
            outcome.verification = 'failed'
            outcome.problem = `${ref}: committed-blob verification failed`
          }
        } else {
          outcome.problem = c.problem
        }
        checked.set(key, outcome)
      }
      const outcome = checked.get(key)
      if (outcome.problem && source === EVIDENCE_PATH) add(`evidence: ${outcome.problem}`)
      evidenceRefs.push({ ref, source, ...outcome })
    }
  } catch (e) {
    add(`internal error: ${e?.message ?? e}`)
  }

  // The same problem can be reached by more than one check; report each once, in first-seen order.
  const uniqueProblems = [...new Set(problems)]
  problems.length = 0
  problems.push(...uniqueProblems)
  const blockers = validation?.blockers ?? []
  const ok = problems.length === 0 && blockers.length === 0 && validation?.activatable === true
  const result = { ok, exitCode: ok ? 0 : 1, runId, geojsonSha256: geojsonHash, problems, blockers, routes, integrity, evidenceRefs, limits: LIMITS }
  return { ...result, text: formatReport(result) }
}

export function formatReport(r) {
  const lines = [
    'BIYAHE route approval validation (validate-only — nothing is written)',
    `Result: ${r.ok ? 'COMPLETE — all five routes have complete, consistent approval records' : 'NOT COMPLETE — approval set rejected'} (exit ${r.exitCode})`,
    `Diagnostic run: ${r.runId ?? '—'}   GeoJSON SHA-256: ${r.geojsonSha256 ?? '—'}`,
    '',
  ]
  if (r.problems.length) lines.push(`Problems (${r.problems.length}):`, ...r.problems.map((p) => `  - ${p}`), '')
  if (r.blockers.length) lines.push(`Blockers (${r.blockers.length}):`, ...r.blockers.map((b) => `  - ${b}`), '')
  const routeIds = Object.keys(r.routes)
  if (routeIds.length) lines.push('Routes (analysis recomputed from the diagnostic raw OSRM data):', ...routeIds.map((id) => `  - ${id}: ${r.routes[id].status}; ${r.routes[id].points} pts incl. campus; ${r.routes[id].routeGeometrySha256}; warnings: ${r.routes[id].warnings.join(', ') || 'none'}`), '')
  if (r.integrity.length) lines.push('Committed integrity:', ...r.integrity.map((x) => `  - ${x.path}  commit ${x.commitSha}  blob sha256 ${x.blobSha256}${x.recordSha256 ? `  record sha256 ${x.recordSha256}` : ''}`), '')
  if (r.evidenceRefs.length) lines.push('Evidence references:', ...r.evidenceRefs.map((e) => `  - [${e.kind}${e.verification ? `: ${e.verification}` : ''}] ${e.ref}  (${e.source})${e.problem ? `  PROBLEM: ${e.problem}` : ''}`), '')
  lines.push('Limits:', ...r.limits.map((l) => `  - ${l}`))
  return lines.join('\n')
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Preflight problems for the CLI environment (pure).
export function preflightProblems({ lifecycleEvent, gitTopLevel, scriptRoot }) {
  const out = []
  if (lifecycleEvent !== 'routes:approve') out.push('Run this validator only with `npm run routes:approve`, which runs the approval tests first.')
  if (!gitTopLevel) out.push('Git is not available or this is not a Git working tree.')
  else if (resolve(gitTopLevel) !== resolve(scriptRoot)) out.push(`Git top level ${gitTopLevel} is not this repository (${scriptRoot}).`)
  return out
}

// Read-only Git access. `exec` is injectable so tests can check the exact arguments without running Git.
// `--no-optional-locks` keeps `git status` from refreshing the index (no write to .git). Blobs are read with
// `git cat-file blob`, which returns the raw committed bytes (no textconv or filters), as a Buffer.
export function realGit(root, exec = execFileSync) {
  const run = (args) => exec('git', args, { cwd: root, encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 })
  const text = (args) => new TextDecoder().decode(run(args))
  const tryText = (args) => { try { return text(args).trim() || null } catch { return null } }
  return {
    lsFiles: () => text(['ls-files', '-z']).split('\0').filter(Boolean),
    statusPorcelainZ: () => text(['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all']),
    lastCommit: (path) => tryText(['log', '-1', '--format=%H', '--', path]),
    showBlob: (commit, path) => { try { return new Uint8Array(run(['cat-file', 'blob', `${commit}:${path}`])) } catch { return null } },
    blobObjectId: (commit, path) => tryText(['rev-parse', `${commit}:${path}`]),
  }
}

// Read-only file access: there is deliberately no write function here.
function realIo(root) {
  return {
    readBytes: (path) => { try { return new Uint8Array(readFileSync(join(root, path))) } catch { return null } },
    listDir: (path) => { try { return readdirSync(join(root, path)) } catch { return null } },
  }
}

function main() {
  let top = null
  try { top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* reported below */ }
  const pre = preflightProblems({ lifecycleEvent: process.env.npm_lifecycle_event, gitTopLevel: top, scriptRoot: ROOT })
  if (pre.length) {
    console.error(pre.join('\n'))
    process.exitCode = 1
    return
  }
  const result = runApproval({ io: realIo(ROOT), git: realGit(ROOT) })
  if (process.argv.includes('--json')) {
    const { text: _text, ...json } = result
    console.log(JSON.stringify(json, null, 2))
  } else {
    console.log(result.text)
  }
  process.exitCode = result.exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main() } catch (e) {
    console.error(`Aborted: ${e?.stack ?? e}`)
    process.exitCode = 1
  }
}
