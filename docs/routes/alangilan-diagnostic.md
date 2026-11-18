# Alangilan route generation — diagnostic report

> DIAGNOSTIC — NOT APPROVED. Every route below is not verified, not confirmed, not approved and not production-ready. Visual plausibility and road-name shares are not evidence of what students actually ride.

- Run ID: `20261117T064232Z-640d24`
- Generated: 2026-11-17T06:42:32.962Z
- Candidate data: not written — 0 FAILED, 5 NEEDS REVIEW (the candidate file is written only when all five are CANDIDATE — NOT APPROVED).
- Diagnostic geometry: `docs/routes/diagnostics/alangilan-candidates.DIAGNOSTIC.20261117T064232Z-640d24.geojson` (git-ignored), viewed with `docs/routes/diagnostic-viewer.html`
- Routing: OSRM demo server (https://router.project-osrm.org), profile `driving`, data version: not reported
- Campus LOCATION: 13.7842, 121.0744
- Processing: [lon, lat] → [lat, lng]; Douglas–Peucker 5 m; rounded to 5 decimals
- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License (ODbL 1.0).

## Summary

Statuses: **FAILED** = blocking validation failure. **NEEDS REVIEW** = no failure, but at least one unresolved human-review warning. **CANDIDATE — NOT APPROVED** = no failure and no unresolved warning; the route is still not approved and not cleared for the app. Every route in this file is not verified, not confirmed, not approved and not production-ready; only a recorded human approval in Phase 2 can change that.

| Corridor | Automated status | Partial | OSRM distance | Primary-road share (raw) | Evidence (inspection aid) | Destination overshoot | Endpoint snap | Final approach |
|---|---|---|---|---|---|---|---|---|
| lipa | NEEDS REVIEW | yes | 3.81 km | 68.9% | substantial | 0 m | 7 m | 86° E |
| batangas | NEEDS REVIEW | — | 4.47 km | 81.8% | substantial | 0 m | 11 m | 169° SSE |
| bauan | NEEDS REVIEW | — | 9.72 km | 67.1% | substantial | 430 m | 39 m | 108° ESE |
| sanjose | NEEDS REVIEW | — | 8.01 km | 74.7% | substantial | not measurable | 203 m | 30° NNE |
| tanauan | NEEDS REVIEW | yes | 9.67 km | 72.1% | substantial | 0 m | 81 m | 167° SSE |

## Unresolved warnings

- **lipa**: campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification
- **batangas**: campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification
- **bauan**: destination overshoot 430 m > 300 m after entering the 100 m zone around the requested destination
- **bauan**: campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification
- **sanjose**: endpoint snap 203 m > 150 m: the snapped destination needs human review
- **sanjose**: endpoint-zone-not-reached: the route never enters the 100 m zone around the requested destination, so destination overshoot is not measurable
- **sanjose**: destination snap bearing constraint applied (30° ± 45°): it does not guarantee the final approach direction; verify the approach visually
- **sanjose**: campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification
- **tanauan**: campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification

## How to read this

- Primary-road share = fraction of OSRM step distance whose road NAME matches the corridor's primary roads. Refs (e.g. 4, E2, 434-1) are shown but never counted. "Evidence" (none / weak < 50% / substantial) is an inspection aid, not proof that a route is correct or that students use it.
- Destination overshoot: from the first point where the route geometry enters the 100 m zone around the requested destination, route distance remaining minus the direct distance to that destination (never below 0). Over 300 m is a warning, over 1,000 m a failure. If the zone is never entered, overshoot is not measurable and that is a warning, not a pass.
- The snapped-endpoint loop measure (San Jose) uses the same method around the snapped destination. It can only add a warning.
- A destination snap bearing constraint only affects where OSRM snaps the destination. Requesting a destination snap bearing does not guarantee the route's final approach direction; compare the two values.
- Near-straight warning: straight-line distance ≥ 500 m and route length ÷ straight-line distance < 1.02. The 3,000 m segment limit only catches glitches.
- The campus exit (unnamed road, Neptune Street, Mercury Street) is an unresolved warning: public access and actual usability require on-site verification.
- Lipa and Tanauan are partial corridor segments that stop before their towns, not full journeys.

## lipa — Lipa City

**Automated status: NEEDS REVIEW** · **Partial route:** ends before the destination town; not a full journey.

**Unresolved warnings (human review required):**
- campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification

| Field | Value |
|---|---|
| App via label (unchanged, comparison only) | JP Laurel Hwy |
| Primary roads (name match only; source: Project team visual review of diagnostic run 20261117T052515Z-1b3f27, 2026-11-17) | Batangas-Balete Road; National Highway 4 |
| Primary-road share (raw) | 68.9% (2.62 km of 3.81 km) — Batangas-Balete Road: 1,409 m; National Highway 4: 1,212 m |
| Road-name evidence (inspection aid, not proof; not evidence of what students ride) | substantial |
| Requested destination (alangilan.ts) | 13.81, 121.07 |
| Destination snap bearing constraint | none |
| Snapped destination | 13.81006, 121.07 (snap 7 m, 7 m from requested; road at snap: (unnamed)) |
| Snapped start | 13.78419, 121.07428 (snap 13 m; road: (unnamed)) |
| Campus → first road point (connector) | 13 m |
| Endpoint zone (100 m around requested destination) reached | yes — entry 13.81001, 121.06907 (segment 117) |
| Destination overshoot (primary) | 0 m (remaining 100 m − direct 100 m) → none |
| Final approach direction (from final 150 m of geometry) | 86° (E); last road: (unnamed) |
| OSRM distance / duration | 3.81 km / 6 min (car, free-flow; not BIYAHE's travel time) |
| Raw geometry (119 pts) / simplified (23 pts) | 3.82 km (Δ 0.3% vs OSRM) / 3.81 km |
| Near-straight check (straight ≥ 500 m and ratio < 1.02) | straight 2,914 m, ratio 1.309 → no warning |
| Longest segment (simplified) | 718 m |
| Campus exit (before first primary road) | (unnamed) 133 m → Neptune Street 410 m → Mercury Street 271 m |
| Unnamed road distance | 0.39 km |

**Roads used (OSRM steps, longest first; refs shown as metadata, never matched):**

| Name | Ref | Distance |
|---|---|---|
| Batangas-Balete Road |  | 1,409 m |
| National Highway 4 | 4 | 1,212 m |
| Neptune Street |  | 410 m |
| (unnamed) |  | 387 m |
| Mercury Street |  | 271 m |
| Diversion Road | 434 | 116 m |

**Forcing via-points:** none.

**Reviewer checklist:**

- [ ] Follows the primary roads on OSM tiles at zoom 16–17 along its whole length
- [ ] Final approach direction is acceptable (compare with any snap bearing constraint)
- [ ] Snapped destination acceptable; partial routes recorded as partial
- [ ] Campus exit checked on site (public access and usability)
- [ ] Approved for Phase 2 (name, date):

## batangas — Batangas City proper

**Automated status: NEEDS REVIEW**

**Unresolved warnings (human review required):**
- campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification

| Field | Value |
|---|---|
| App via label (unchanged, comparison only) | P. Burgos |
| Primary roads (name match only; source: Project team visual review of diagnostic run 20261117T052515Z-1b3f27, 2026-11-17) | National Highway 4; P. Burgos Street |
| Primary-road share (raw) | 81.8% (3.66 km of 4.47 km) — National Highway 4: 3,138 m; P. Burgos Street: 523 m |
| Road-name evidence (inspection aid, not proof; not evidence of what students ride) | substantial |
| Requested destination (alangilan.ts) | 13.7575, 121.058 |
| Destination snap bearing constraint | none |
| Snapped destination | 13.75752, 121.0581 (snap 11 m, 11 m from requested; road at snap: P. Burgos Street) |
| Snapped start | 13.78419, 121.07428 (snap 13 m; road: (unnamed)) |
| Campus → first road point (connector) | 13 m |
| Endpoint zone (100 m around requested destination) reached | yes — entry 13.75839, 121.05791 (segment 179) |
| Destination overshoot (primary) | 0 m (remaining 99 m − direct 100 m) → none |
| Final approach direction (from final 150 m of geometry) | 169° (SSE); last road: P. Burgos Street [ref 437] |
| OSRM distance / duration | 4.47 km / 6 min (car, free-flow; not BIYAHE's travel time) |
| Raw geometry (185 pts) / simplified (23 pts) | 4.49 km (Δ 0.3% vs OSRM) / 4.49 km |
| Near-straight check (straight ≥ 500 m and ratio < 1.02) | straight 3,442 m, ratio 1.303 → no warning |
| Longest segment (simplified) | 526 m |
| Campus exit (before first primary road) | (unnamed) 133 m → Neptune Street 410 m → Mercury Street 271 m |
| Unnamed road distance | 0.13 km |

**Roads used (OSRM steps, longest first; refs shown as metadata, never matched):**

| Name | Ref | Distance |
|---|---|---|
| National Highway 4 | 4 | 3,138 m |
| P. Burgos Street | 437 | 523 m |
| Neptune Street |  | 410 m |
| Mercury Street |  | 271 m |
| (unnamed) |  | 133 m |

**Forcing via-points:** none.

**Reviewer checklist:**

- [ ] Follows the primary roads on OSM tiles at zoom 16–17 along its whole length
- [ ] Final approach direction is acceptable (compare with any snap bearing constraint)
- [ ] Snapped destination acceptable; partial routes recorded as partial
- [ ] Campus exit checked on site (public access and usability)
- [ ] Approved for Phase 2 (name, date):

## bauan — Bauan / San Pascual

**Automated status: NEEDS REVIEW**

**Unresolved warnings (human review required):**
- destination overshoot 430 m > 300 m after entering the 100 m zone around the requested destination
- campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification

| Field | Value |
|---|---|
| App via label (unchanged, comparison only) | Diversion Rd |
| Primary roads (name match only; source: Project team visual review of diagnostic run 20261117T052515Z-1b3f27, 2026-11-17) | Batangas City–San Pascual–Bauan Bypass Road; Aquino Avenue |
| Primary-road share (raw) | 67.1% (6.52 km of 9.72 km) — Batangas City–San Pascual–Bauan Bypass Road: 4,690 m; Aquino Avenue: 1,833 m |
| Road-name evidence (inspection aid, not proof; not evidence of what students ride) | substantial |
| Requested destination (alangilan.ts) | 13.79, 121.02 |
| Destination snap bearing constraint | none |
| Snapped destination | 13.79019, 121.0197 (snap 39 m, 39 m from requested; road at snap: (unnamed)) |
| Snapped start | 13.78419, 121.07428 (snap 13 m; road: (unnamed)) |
| Campus → first road point (connector) | 13 m |
| Endpoint zone (100 m around requested destination) reached | yes — entry 13.78935, 121.02064 (segment 238) |
| Destination overshoot (primary) | 430 m (remaining 530 m − direct 100 m) → review |
| Final approach direction (from final 150 m of geometry) | 108° (ESE); last road: (unnamed) |
| OSRM distance / duration | 9.72 km / 12 min (car, free-flow; not BIYAHE's travel time) |
| Raw geometry (247 pts) / simplified (57 pts) | 9.73 km (Δ 0.1% vs OSRM) / 9.72 km |
| Near-straight check (straight ≥ 500 m and ratio < 1.02) | straight 5,932 m, ratio 1.639 → no warning |
| Longest segment (simplified) | 762 m |
| Campus exit (before first primary road) | (unnamed) 133 m → Neptune Street 410 m → Mercury Street 271 m |
| Unnamed road distance | 0.79 km |

**Roads used (OSRM steps, longest first; refs shown as metadata, never matched):**

| Name | Ref | Distance |
|---|---|---|
| Batangas City-San Pascual-Bauan Bypass Road | 434-1 | 4,690 m |
| Aquino Avenue |  | 1,833 m |
| National Highway 4 | 4 | 1,212 m |
| (unnamed) |  | 793 m |
| Neptune Street |  | 410 m |
| Batangas-Balete Road |  | 311 m |
| Mercury Street |  | 271 m |
| Diversion Road | 434 | 116 m |
| National Highway 436 | 436 | 81 m |

**Forcing via-points:** none.

**Reviewer checklist:**

- [ ] Follows the primary roads on OSM tiles at zoom 16–17 along its whole length
- [ ] Final approach direction is acceptable (compare with any snap bearing constraint)
- [ ] Snapped destination acceptable; partial routes recorded as partial
- [ ] Campus exit checked on site (public access and usability)
- [ ] Approved for Phase 2 (name, date):

## sanjose — San Jose / Ibaan

**Automated status: NEEDS REVIEW**

**Unresolved warnings (human review required):**
- endpoint snap 203 m > 150 m: the snapped destination needs human review
- endpoint-zone-not-reached: the route never enters the 100 m zone around the requested destination, so destination overshoot is not measurable
- destination snap bearing constraint applied (30° ± 45°): it does not guarantee the final approach direction; verify the approach visually
- campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification

| Field | Value |
|---|---|
| App via label (unchanged, comparison only) | Batangas–Lipa Rd |
| Primary roads (name match only; source: Project team visual review of diagnostic run 20261117T052515Z-1b3f27, 2026-11-17) | STAR Tollway (Southern Tagalog Arterial Road / E2) |
| Primary-road share (raw) | 74.7% (5.98 km of 8.01 km) — STAR Tollway (Southern Tagalog Arterial Road / E2): 5,980 m |
| Road-name evidence (inspection aid, not proof; not evidence of what students ride) | substantial |
| Requested destination (alangilan.ts) | 13.82, 121.115 |
| Destination snap bearing constraint | 30° ± 45° (OSRM `bearings=;30,45`; affects only where OSRM snaps the destination) |
| Snapped destination | 13.8191, 121.11663 (snap 203 m, 202 m from requested; road at snap: Southern Tagalog Arterial Road) |
| Snapped start | 13.78419, 121.07428 (snap 13 m; road: (unnamed)) |
| Campus → first road point (connector) | 13 m |
| Endpoint zone (100 m around requested destination) reached | no |
| Destination overshoot (primary) | not measurable — endpoint zone not reached → not-measurable |
| Snapped-endpoint loop (auxiliary; cannot cause FAILED, cannot clear warnings) | 0 m (remaining 100 m − direct 100 m) → none |
| Final approach direction (from final 150 m of geometry) | 30° (NNE); last road: Southern Tagalog Arterial Road [ref E2] |
| OSRM distance / duration | 8.01 km / 11 min (car, free-flow; not BIYAHE's travel time) |
| Raw geometry (145 pts) / simplified (29 pts) | 8.02 km (Δ 0.1% vs OSRM) / 8.01 km |
| Near-straight check (straight ≥ 500 m and ratio < 1.02) | straight 5,999 m, ratio 1.335 → no warning |
| Longest segment (simplified) | 1,585 m |
| Campus exit (before first primary road) | (unnamed) 133 m → Neptune Street 410 m → Mercury Street 271 m |
| Unnamed road distance | 0.13 km |

**Roads used (OSRM steps, longest first; refs shown as metadata, never matched):**

| Name | Ref | Distance |
|---|---|---|
| Southern Tagalog Arterial Road | E2 | 5,980 m |
| National Highway 4 | 4 | 1,212 m |
| Neptune Street |  | 410 m |
| Mercury Street |  | 271 m |
| (unnamed) |  | 133 m |

**Forcing via-points:** none.

**Destination snap bearing provenance:** source: Northbound STAR carriageway geometry nearest the endpoint in diagnostic run 20261117T052515Z-1b3f27 (13.818842, 121.116483); reason: Without it the destination snaps to the southbound carriageway, producing a 4.9 km overshoot and return; added by BIYAHE project team (planning review) on 2026-11-17.

**Reviewer checklist:**

- [ ] Follows the primary roads on OSM tiles at zoom 16–17 along its whole length
- [ ] Final approach direction is acceptable (compare with any snap bearing constraint)
- [ ] Snapped destination acceptable; partial routes recorded as partial
- [ ] Campus exit checked on site (public access and usability)
- [ ] Approved for Phase 2 (name, date):

## tanauan — Tanauan / Sto. Tomas

**Automated status: NEEDS REVIEW** · **Partial route:** ends before the destination town; not a full journey.

**Unresolved warnings (human review required):**
- campus exit unresolved: 814 m via (unnamed) → Neptune Street → Mercury Street; public access and actual usability require on-site verification

| Field | Value |
|---|---|
| App via label (unchanged, comparison only) | STAR Tollway |
| Primary roads (name match only; source: Project team visual review of diagnostic run 20261117T052515Z-1b3f27, 2026-11-17) | President Jose P. Laurel Highway |
| Primary-road share (raw) | 72.1% (6.97 km of 9.67 km) — President Jose P. Laurel Highway: 6,968 m |
| Road-name evidence (inspection aid, not proof; not evidence of what students ride) | substantial |
| Requested destination (alangilan.ts) | 13.85, 121.095 |
| Destination snap bearing constraint | none |
| Snapped destination | 13.85073, 121.09496 (snap 81 m, 81 m from requested; road at snap: Charito Makalintal Road) |
| Snapped start | 13.78419, 121.07428 (snap 13 m; road: (unnamed)) |
| Campus → first road point (connector) | 13 m |
| Endpoint zone (100 m around requested destination) reached | yes — entry 13.85086, 121.09472 (segment 333) |
| Destination overshoot (primary) | 0 m (remaining 38 m − direct 100 m) → none |
| Final approach direction (from final 150 m of geometry) | 167° (SSE); last road: Charito Makalintal Road |
| OSRM distance / duration | 9.67 km / 10 min (car, free-flow; not BIYAHE's travel time) |
| Raw geometry (338 pts) / simplified (46 pts) | 9.70 km (Δ 0.4% vs OSRM) / 9.69 km |
| Near-straight check (straight ≥ 500 m and ratio < 1.02) | straight 7,729 m, ratio 1.254 → no warning |
| Longest segment (simplified) | 946 m |
| Campus exit (before first primary road) | (unnamed) 133 m → Neptune Street 410 m → Mercury Street 271 m |
| Unnamed road distance | 0.13 km |

**Roads used (OSRM steps, longest first; refs shown as metadata, never matched):**

| Name | Ref | Distance |
|---|---|---|
| President Jose P. Laurel Highway | 4 | 6,968 m |
| National Highway 4 | 4 | 1,212 m |
| Charito Makalintal Road |  | 675 m |
| Neptune Street |  | 410 m |
| Mercury Street |  | 271 m |
| (unnamed) |  | 133 m |

**Forcing via-points:** none.

**Reviewer checklist:**

- [ ] Follows the primary roads on OSM tiles at zoom 16–17 along its whole length
- [ ] Final approach direction is acceptable (compare with any snap bearing constraint)
- [ ] Snapped destination acceptable; partial routes recorded as partial
- [ ] Campus exit checked on site (public access and usability)
- [ ] Approved for Phase 2 (name, date):
