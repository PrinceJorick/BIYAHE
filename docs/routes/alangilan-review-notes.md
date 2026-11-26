# Alangilan routes: human review notes

Maintained by hand. Not generated, and not overwritten by `npm run routes:alangilan`.

Nothing in this file is an approval for app integration. Every candidate route remains not verified,
not confirmed and not production-ready until a Phase 2 approval is recorded. Human review here does not
clear any automated warning: generator statuses and warnings stay exactly as the generator reports them.

> **Status update (26 November 2026).** Since Iteration 4 the app no longer shows the hand-drawn routes. It shows
> unreviewed road-following trip routes generated with OSRM over OpenStreetMap (`npm run routes:campuses`,
> `src/campuses/alangilan.trip.roads.ts`, enabled by `PREVIEW_ON` in `src/campuses/alangilan.ts`), validated at runtime
> and labelled as not checked on site. Formal approval is still pending: no approval record exists, and formally
> reviewed geometry (`src/campuses/alangilan.roads.ts`, currently `null`) would take precedence once approved.
> Statements below about hand-drawn routes describe the state when this document was written.

## Runs referred to

| Run ID | Purpose | Artefacts |
|---|---|---|
| `20261117T052515Z-1b3f27` | First diagnostic export; basis for the primary road groups | **Local-only.** Its GeoJSON (`docs/routes/diagnostics/alangilan-candidates.DIAGNOSTIC.20261117T052515Z-1b3f27.geojson`) is git-ignored and not included in the repository. Its diagnostic report was overwritten by the later run. The figures below were measured from that local file. |
| `20261117T064232Z-640d24` | Current diagnostic run: primary road groups, San Jose destination snap bearing, overshoot checks | Report: `docs/routes/alangilan-diagnostic.md` (in the repository). GeoJSON: `docs/routes/diagnostics/alangilan-candidates.DIAGNOSTIC.20261117T064232Z-640d24.geojson` (git-ignored, local to the reviewer's machine). |

## Review A: visual inspection of run 20261117T052515Z-1b3f27 (2026-11-17)

- Reviewer: BIYAHE project team.
- Method: visual inspection of all five candidate routes in `docs/routes/diagnostic-viewer.html` on
  OpenStreetMap tiles.
- Finding: all five appeared to follow actual roads and travel toward their intended destinations. The main
  roads selected by OSRM appeared reasonable to the team.
- Outcome: the team proposed the primary road groups now in `src/lib/routeChecks.js` (`CORRIDORS`), matched by
  road name only. Refs are never counted.

Primary-road shares measured locally from this run (name-only, before the San Jose bearing was added):

| Corridor | Primary roads | Share |
|---|---|---|
| lipa | Batangas-Balete Road; National Highway 4 | 68.9% |
| batangas | National Highway 4; P. Burgos Street | 81.8% |
| bauan | Batangas City–San Pascual–Bauan Bypass Road; Aquino Avenue | 67.1% |
| sanjose | STAR Tollway (Southern Tagalog Arterial Road / E2) | 76.3% (inflated by about 2 km of STAR travelled during a loop) |
| tanauan | President Jose P. Laurel Highway | 72.1% |

After this review, automated analysis of the same run found the San Jose loop. The route got within 100 m of
its endpoint, then travelled another 4.9 km through the San Jose–Ibaan interchange and back. This led to the
destination snap bearing constraint used in the next run.

## Review B: run 20261117T064232Z-640d24, including Bauan's final section (2026-11-17)

- Reviewer: BIYAHE project team.
- Method: visual inspection of all five candidate routes in the diagnostic viewer on OpenStreetMap tiles.
- Finding: road alignment and destinations of all five appear reasonable.
- **Bauan final section:** inspected on the OSM map. The 430 m detour measured by the automated
  destination-overshoot check is considered visually acceptable for continued evaluation.
  - The automated 430 m overshoot warning is **not deleted and not automatically cleared**. It remains in the
    generator output, and Bauan remains NEEDS REVIEW.
  - Clearing it would need a separate, recorded human resolution agreed by the team.

Automated statuses for this run are unchanged by this review:

| Corridor | Automated status | Primary-road share | Visual finding (Review B) |
|---|---|---|---|
| lipa | NEEDS REVIEW | 68.9% | Alignment and direction appear reasonable |
| batangas | NEEDS REVIEW | 81.8% | Alignment and destination appear reasonable |
| bauan | NEEDS REVIEW | 67.1% | Final section, including the 430 m detour, acceptable for continued evaluation |
| sanjose | NEEDS REVIEW | 74.7% | Alignment and direction appear reasonable; endpoint issues remain open (below) |
| tanauan | NEEDS REVIEW | 72.1% | Alignment and direction appear reasonable |

## Review C: browser validation (2026-11-17)

- Reported by the BIYAHE project team: the browser checks were completed.
  - The updated `docs/routes/diagnostic-viewer.html` was opened with the run `20261117T064232Z-640d24`
    GeoJSON.
  - The student and staff maps were checked after the map-fit refactor in `src/components/CorridorMap.tsx`,
    which is intended to leave the map display unchanged.
- This validates the viewer and the unchanged app maps. It does not validate any route for app use.

## Unresolved issues (separate from the reviews above)

### San Jose / Ibaan endpoint: unresolved
- The destination snaps **203 m** from the requested endpoint (13.82, 121.115) onto Southern Tagalog Arterial
  Road. This is above the 150 m review limit.
- The route **never enters the requested 100 m endpoint zone**, so the destination overshoot is not
  measurable. That is an open warning, not a pass.
- How the bearing was chosen: the 30° value was measured from the **northbound STAR carriageway geometry
  observed in the local-only run `20261117T052515Z-1b3f27`**, at the point nearest the requested endpoint
  (13.818842, 121.116483). That run's GeoJSON is git-ignored and not included in the repository.
- The destination snap bearing constraint (30° ± 45°) only affects where OSRM snaps the destination. The
  final approach measured in run `20261117T064232Z-640d24` was 30° (NNE). Requesting a bearing does not
  guarantee an approach direction.
- The auxiliary snapped-endpoint loop measure read 0 m in this run. It cannot clear the warnings above.

### Shared campus exit: unresolved
- All five routes leave campus via an unnamed road (about 133 m), Neptune Street (about 410 m) and Mercury
  Street (about 271 m), about 814 m in total, before reaching their primary roads.
- Public access and actual usability of this exit have **not** been checked on site. The warning stays on
  every route until an on-site check is recorded.

## Partial routes
Lipa and Tanauan remain **partial route segments**. They stop before their destination towns and are not
full journeys.

## Limits of these reviews
- Visual inspection shows how a route lines up with roads on the map. It is not evidence of what students
  actually ride, and not evidence of on-site public access.
- OSRM's driving profile picks a fastest car route, not jeepney or bus routes.
- Road-name shares are an inspection aid, not proof that a route is correct.

## Not changed by these reviews
- automated statuses, warnings and generator rules
- route geometry
- `src/campuses/alangilan.ts` and every application route path
- app labels, demo advisories and travel times
- Supabase and the other campuses

No candidate route data (`src/campuses/alangilan.routes.ts`) has been generated. Nothing is integrated into
the app.

## Open checklist
- [ ] On-site check of the campus exit (unnamed road, Neptune Street, Mercury Street): public access and usability
- [ ] San Jose / Ibaan: decide how to handle the 203 m destination snap and the unreachable requested endpoint zone
- [ ] Bauan: recorded resolution for the 430 m overshoot warning (if it is to be cleared)
- [ ] Phase 2 approval per route (name, date):
