// Type declarations for scripts/approve-routes.mjs (developer-only, validate-only approval validator), so
// tests can import it directly. Importing the module never runs it: main() only runs when the file is
// executed with `node`.
import type { CorridorConfig } from '../src/lib/routeChecks'

export const APPROVALS_DIR: string
export const EVIDENCE_PATH: string
export const DIAGNOSTICS_DIR: string
export function diagnosticGeoJsonPath(runId: string): string
export function recordPath(routeId: string): string
export const HTTPS_LIMITATION: string
export const RAW_DATA_LIMITATION: string
export const LIMITS: string[]

/** Read-only file access. There is deliberately no write method. */
export type ApprovalIo = {
  readBytes(path: string): Uint8Array | null
  listDir(path: string): string[] | null
}
export type ApprovalGit = {
  lsFiles(): string[]
  statusPorcelainZ(): string
  lastCommit(path: string): string | null
  /** Raw committed blob bytes (git cat-file blob). */
  showBlob(commit: string, path: string): Uint8Array | null
  blobObjectId(commit: string, path: string): string | null
}

export type IntegrityRow = { path: string; commitSha: string; blobSha256: string; recordSha256?: string }
export type EvidenceRefReport = {
  ref: unknown
  source: string
  kind: 'https' | 'repo' | 'invalid'
  verification?: string
  problem?: string
  commitSha?: string
  blobObjectId?: string | null
  sha256?: string
}
export type ApprovalResult = {
  ok: boolean
  exitCode: 0 | 1
  runId: string | null
  geojsonSha256: string | null
  problems: string[]
  blockers: string[]
  routes: Record<string, { status: string; routeGeometrySha256: string; points: number; warnings: string[] }>
  integrity: IntegrityRow[]
  evidenceRefs: EvidenceRefReport[]
  limits: string[]
  text: string
}

export function runApproval(opts: {
  io: ApprovalIo
  git: ApprovalGit
  corridors?: readonly CorridorConfig[]
}): ApprovalResult
/** Read-only Git access; `exec` (default child_process.execFileSync) is injectable for argument tests. */
export type GitExec = (file: 'git', args: string[], opts: { cwd: string; encoding: 'buffer'; stdio: ['ignore', 'pipe', 'pipe']; maxBuffer: number }) => Uint8Array
export function realGit(root: string, exec?: GitExec): ApprovalGit
export function formatReport(result: Omit<ApprovalResult, 'text'>): string
export function preflightProblems(opts: { lifecycleEvent: string | undefined; gitTopLevel: string | null; scriptRoot: string }): string[]
