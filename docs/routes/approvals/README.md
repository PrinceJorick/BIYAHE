# Alangilan route approvals

This folder will hold the **human approval records** for the five Alangilan road-based routes, and the
**shared campus-exit evidence** they rely on. It currently contains only this README: there are no records yet and every route is still not approved;
no reviewed road geometry is used by the app (see the status update below).

> **Status update (26 November 2026).** Since Iteration 4 the app no longer shows the hand-drawn routes. It shows
> unreviewed road-following trip routes generated with OSRM over OpenStreetMap (`npm run routes:campuses`,
> `src/campuses/alangilan.trip.roads.ts`, enabled by `PREVIEW_ON` in `src/campuses/alangilan.ts`), validated at runtime
> and labelled as not checked on site. Formal approval is still pending: no approval record exists, and formally
> reviewed geometry (`src/campuses/alangilan.roads.ts`, currently `null`) would take precedence once approved.
> Statements below about hand-drawn routes describe the state when this document was written.
>
> A sixth Alangilan route, **Rosario**, was added on 26 November 2026. It is not part of this approval workflow
> (`ROUTE_IDS` in `src/lib/routeChecks.js` lists the original five). Add it to the workflow before supplying a reviewed
> road set; otherwise that set will not match the app's six routes and the app falls back to the hand-drawn paths.

Approval is checked by a developer-only, **validate-only** tool:

```
npm run routes:approve            # human-readable report
npm run routes:approve -- --json  # same result as JSON
```

The npm script runs the approval tests first, then `scripts/approve-routes.mjs`. The validator **never writes
a file** and makes **no network request**. It exits `0` only when all five records are complete, consistent
and free of blockers; otherwise `1`. Generating application road data from a complete set is a later step and
is not implemented yet.

## Files

| Path | Content |
|---|---|
| `alangilan/<routeId>.json` | One record per route: `lipa`, `batangas`, `bauan`, `sanjose`, `tanauan`. The file name must equal the record's `routeId`; no other files are allowed in this folder. |
| `evidence/alangilan-campus-exit.json` | The single shared on-site evidence record for the campus exit, referenced by every route. |
| `evidence/…` (optional) | Committed supporting files referenced as evidence (for example a photo log). |
| `../diagnostics/alangilan-candidates.DIAGNOSTIC.<runId>.geojson` | The exact diagnostic GeoJSON of the run under review, in diagnostic schema `ds-1`. It must be **committed** (see "Committing the diagnostic GeoJSON"). |

`.gitattributes` keeps approval JSON as LF and the diagnostic GeoJSON free of any line-ending conversion.

## Workflow

1. A diagnostic run is generated (`npm run routes:alangilan`, a separate step that needs its own sign-off) and its GeoJSON is
   committed under `docs/routes/diagnostics/` so reviewers can open the exact file (see below).
2. Reviewers inspect the routes and write the five records and the shared evidence, copying each warning
   **exactly** from the run and adding a separate resolution for it.
3. The records and evidence are reviewed and **committed** first.
4. `npm run routes:approve` validates the committed state. Any edit to a record afterwards requires
   re-running it.

## Committing the diagnostic GeoJSON

`docs/routes/diagnostics/*.geojson` is ignored by `.gitignore` so local runs are never committed by
accident. The one run under review is committed deliberately, by exact path (`.gitignore` is not changed):

1. Confirm the file is stored without line-ending conversion:
   `git check-attr text -- docs/routes/diagnostics/<file>.geojson` must report `text: unset` (the `-text` rule in
   `.gitattributes`).
2. Add it by its exact path, never with a wildcard: `git add -f docs/routes/diagnostics/<file>.geojson`.
3. Commit it in the pull request that carries the approval records for that run.
4. Confirm it is tracked and clean: `git ls-files -- <path>` lists it and `git status --porcelain -- <path>`
   prints nothing.
5. Confirm the committed blob is the reviewed file: the SHA-256 of `git cat-file blob HEAD:<path>` must equal the
   GeoJSON SHA-256 printed in `docs/routes/alangilan-diagnostic.md` for that run (and later every record's
   `geojsonSha256`).

Diagnostics written before diagnostic schema `ds-1` (generator 2.1.0) lack the exact data needed to re-run
the analysis and cannot be approved; generate a new run instead.

## What the validator checks

- **Git state** — every record, the evidence file, every repository evidence reference and the diagnostic
  GeoJSON must be tracked and unmodified (no staged, unstaged or untracked change). The committed blob of each
  is read as raw bytes:
  - records and evidence JSON: the working copy and the committed version must have the same record hash
    (SHA-256 after CRLF→LF normalization; a byte-order mark, invalid UTF-8 or a stray carriage return is
    rejected);
  - the diagnostic GeoJSON: working bytes must equal the committed blob exactly.
- **Strict JSON** — records and evidence are parsed strictly: duplicate keys (at any depth, also when spelled
  with escapes such as `"a"`), trailing commas, comments and other non-JSON syntax are rejected, with the
  line and column.
- **The diagnostic run** — all records cite one run; the GeoJSON's exact-bytes SHA-256 equals every record's
  `geojsonSha256`; its run ID matches; it declares `diagnosticSchemaVersion: "ds-1"` and carries the current
  versions, structured warnings and geometry hashes (older runs are rejected); every stored status is one of
  the three known statuses.
- **Recomputed analysis** — the validator does not trust any stored result. For each route it rebuilds the
  OSRM response from the raw data the diagnostic stores (route geometry, OSRM distance and duration, data
  version, every step's name, ref, exact distance, maneuver and geometry in index order, and the exact
  snapped start and end locations, snap distances and names) and re-runs the generator's own analysis with the
  configured corridor, bearings and thresholds. Missing, duplicate, ill-typed or out-of-order data is rejected;
  nothing is defaulted. Every stored feature of the route (status, warnings, geometry hash, simplified path,
  metrics, zones, steps) must equal the recomputed one exactly, and the records are validated against the
  **recomputed** status, warnings, hash and snapped endpoint. The routing policy stored in the diagnostic must
  match the code.
- **Versions** — routing policy, geometry processing, warning schema and approval schema must all match the
  code. (The generator version is informational.)
- **Records** — schema and required fields, with unknown fields rejected at every level (records,
  resolutions, `endpointRelationship`, `conditionsAcknowledged`, history entries, the evidence record and its
  findings; the field sets are pinned in `APPROVAL_SCHEMA_PARAMS.fields`); warnings copied verbatim with none missing or extra; exactly one
  resolution per warning; allowed outcomes and evidence types; endpoint relationships; history entries;
  `pathEnds` (Lipa and Tanauan are partial); no FAILED route; any `unresolved` outcome blocks.

## Record schema (approval schema `as-1`)

Each route record contains the five version fields, `campus: "alangilan"`, `routeId`, `runId`,
`geojsonSha256`, `routeGeometrySha256`, `pathEnds`, `reviewedBy`, `reviewedOn` (YYYY-MM-DD), and:

- `warnings` — the run's warnings for this route, copied exactly: `{ code, text, value }`.
- `resolutions` — one per warning: `warningCode`, `outcome`, `resolution`, `reviewer`, `reviewedOn`,
  `evidenceType`, `evidenceRef`, `runId`, `routeGeometrySha256`, plus:
  - for endpoint warnings (`endpoint-snap`, `endpoint-zone-not-reached`): `endpointRelationship` with
    `requestedEndpoint` (must equal the configured endpoint), `acceptedEndpoint` (must equal the snapped
    endpoint in the run), `separationM` (within 1 m of the measured distance), `intendedDestination` and
    `relationship`. A team decision alone cannot resolve these; if the intended destination changes, change the
    configured endpoint and generate a new run instead;
  - for the campus exit (`campus-exit-unverified`): `sharedEvidenceId` and `conditionsAcknowledged` (repeating
    the evidence conditions exactly).
- `history` — warnings from **earlier** runs that a documented configuration change removed (outcome
  `corrected`, with `configChange`).

**Outcomes**: `accepted-limitation` (the condition remains and is accepted with evidence) or `unresolved`
(recorded; blocks approval). `corrected` is allowed only in `history`. Human review never deletes or clears an
original warning.

**Evidence types per warning** are defined by the approval schema (`APPROVAL_SCHEMA_PARAMS.evidenceResolution`
in `src/lib/routeVersions.js`). The campus exit can be resolved only by on-site inspection through the shared
evidence record.

## Shared campus-exit evidence

`evidence/alangilan-campus-exit.json` records one on-site inspection: `evidenceId`, `evidenceType:
"on-site-inspection"`, `subject`, `segmentsInspected`, `inspectedOn`, `inspectedBy`, `publicAccess` and
`usability` (`status`, `finding`, and `conditions` when the status is conditional), `evidenceRefs`,
`appliesToRoutes` and `limitations`.

- It can clear the warning only when public access is `public` or `public-with-conditions` **and** usability
  is `usable` or `usable-with-conditions`. `restricted`, `private`, `blocked`, `unusable` or `unknown` findings
  must stay `unresolved`.
- `segmentsInspected` must cover every road named in the route's campus-exit warning. Unnamed segments are
  written as `(unnamed)`, exactly as the warning names them.
- Committed photos or notes must not show identifiable people or vehicle plates (RA 10173).

## Evidence references

Every `evidenceRefs` entry and every resolution `evidenceRef` must be one of:

- **an `https://` URL** — checked for form only. The validator makes no network request and does **not**
  verify that the page exists or what it shows; reviewers must open it. The report labels these
  `structural-only`.
- **a committed repository file** (a normalized repo-relative path) under `docs/routes/approvals/evidence/` or
  `docs/routes/` (`APPROVAL_SCHEMA_PARAMS.evidenceRefPrefixes`) — must be tracked and unmodified; its
  committed blob is read and hashed, and the report labels it `committed-blob-verified` with the commit,
  blob ID and SHA-256.

Each distinct reference is checked once; a repeated reference reuses that result, including a failure. An
invalid reference in the shared evidence file always fails the set, even if no route currently relies on it.

Local absolute paths, `~`, network-share paths, `file:` and `http:` links, `..` paths, and untracked,
uncommitted or modified files, and repository files outside the allowed prefixes are rejected.

## Limits

- **Trust boundary: the raw OSRM data in the committed diagnostic.** Re-running the analysis proves that the
  stored results are consistent with the stored raw data; it does not prove that the raw data is genuine OSRM
  output. Someone could edit the raw data consistently. The diagnostic is therefore reviewed and committed as
  generator output, and its Git history is the record of where it came from.
- The validator cannot verify that an on-site inspection happened or that recorded findings are true; human
  review of the records remains necessary.
- HTTPS evidence is checked for form only.
- Visual plausibility and road-name shares are not evidence of what students ride.
- A validated set is not yet used by the app; integrating road geometry is a later step.
