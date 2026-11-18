# Alangilan field verification checklist

Preparation document for **authorized campus personnel** (for example campus security, the DRRM office or
facilities staff). No inspection has been performed yet; every finding field below is intentionally blank.

> **Safety and authority.** Inspections must be carried out only by authorized personnel, using lawful and
> safe access, with permission from the property owner or road authority where needed. Students must not be
> asked to enter restricted property or to inspect expressway infrastructure. Nobody should stand or walk on an
> expressway carriageway or shoulder to complete this checklist; where a location cannot be reached lawfully and
> safely, record that as the finding.

> **Privacy (RA 10173).** Do not record identifiable information about bystanders. Photographs must not show
> identifiable faces or vehicle registration plates; crop or blur them before they are committed or shared.

- Diagnostic run: `20261117T124418Z-45d1ea` (GeoJSON SHA-256
  `70df8461a670d3113524b524fcde322c030cf542d22202177fc5d51c1f86156e`, committed in `0d4aa8e`)
- Diagnostic report: `docs/routes/alangilan-diagnostic.md`
- Project-owner review: `docs/routes/reviews/alangilan-review-20261117T124418Z-45d1ea.md`
- Coordinates are [latitude, longitude]. Locations come from OpenStreetMap-based routing and may not match what
  is on the ground; record what is actually found.

---

## A. Shared campus exit (all five routes)

All five candidate routes leave campus by the same approach before joining National Highway 4. Lengths and
coordinates are from the diagnostic.

| Order | Segment | Length (approx.) | Start | End |
|---|---|---|---|---|
| 1 | `(unnamed)` | 132.5 m | 13.784193, 121.074282 (near the campus point 13.7842, 121.0744) | 13.785388, 121.074209 |
| 2 | Neptune Street | 410.1 m | 13.785388, 121.074209 | 13.786551, 121.071675 |
| 3 | Mercury Street | 271.0 m | 13.786551, 121.071675 | 13.786623, 121.069199 |
| — | Junction with National Highway 4 | — | 13.786623, 121.069199 | — |

Total approach: about 813.6 m. A road name or map classification is not evidence of public access.

### What the inspection must establish

For each segment, and for the approach as a whole:
1. Is the segment publicly accessible?
2. Can students legitimately use the entire approach, from campus to National Highway 4?
3. Are there gates, barriers, guards, restrictions, opening hours or other access conditions?
4. Can pedestrians use it safely (footpath or shoulder, traffic, crossings)?
5. Do the road surface, drainage or flooding, lighting or other physical conditions limit use (including at
   night and in rain)?
6. Does the approach reach National Highway 4 without passing through restricted or private property?

### Segment 1 — `(unnamed)`, about 132.5 m

| Item | Record |
|---|---|
| Inspected (yes / no / could not access) | |
| Public access (public / public-with-conditions / restricted / private / blocked / unknown) | |
| Gates, barriers, guard posts | |
| Opening hours or other conditions | |
| Who may pass (students, public, vehicles, pedestrians) | |
| Pedestrian safety | |
| Surface, drainage, lighting | |
| Other observations | |
| Photo / document references | |

### Segment 2 — Neptune Street, about 410.1 m

| Item | Record |
|---|---|
| Inspected (yes / no / could not access) | |
| Public access (public / public-with-conditions / restricted / private / blocked / unknown) | |
| Gates, barriers, guard posts | |
| Opening hours or other conditions | |
| Who may pass (students, public, vehicles, pedestrians) | |
| Pedestrian safety | |
| Surface, drainage, lighting | |
| Other observations | |
| Photo / document references | |

### Segment 3 — Mercury Street, about 271.0 m

| Item | Record |
|---|---|
| Inspected (yes / no / could not access) | |
| Public access (public / public-with-conditions / restricted / private / blocked / unknown) | |
| Gates, barriers, guard posts | |
| Opening hours or other conditions | |
| Who may pass (students, public, vehicles, pedestrians) | |
| Pedestrian safety | |
| Surface, drainage, lighting | |
| Other observations | |
| Photo / document references | |

### Junction with National Highway 4 (13.786623, 121.069199)

| Item | Record |
|---|---|
| Inspected (yes / no / could not access) | |
| Reached without passing through restricted or private property? | |
| Safe for pedestrians to reach and wait (crossing, footpath, traffic) | |
| Observations | |
| Photo / document references | |

### Whole approach — summary

| Item | Record |
|---|---|
| Can students legitimately use the entire approach? | |
| Overall public access (public / public-with-conditions / restricted / private / blocked / unknown) | |
| Overall usability (usable / usable-with-conditions / unusable / unknown) | |
| Conditions (required if either finding is "with-conditions") | |

---

## B. San Jose / Ibaan destination connection

Diagnostic facts (run `20261117T124418Z-45d1ea`):

| Item | Value |
|---|---|
| Configured destination | 13.82, 121.115 |
| OSRM road endpoint | 13.819101, 121.116634 — on the Southern Tagalog Arterial Road (STAR, E2) mainline, northbound carriageway, according to the diagnostic |
| Separation | about 202.5 m; the configured destination lies west-north-west (299.5°) of the road endpoint |
| Route's closest approach to the destination | about 202.8 m (the route never enters the 100 m destination zone) |

The project owner's interpretation (see the review document) is a vehicle route ending at the nearest mapped
road, followed by a pedestrian last-mile connection. **The OSRM endpoint is not assumed to be an acceptable
passenger drop-off point.** It is a point on an expressway mainline in OpenStreetMap-based routing data.

Do not walk on, stop on or cross the expressway to check this. Use public roads, official information
(for example from the expressway operator or local government) and lawful vantage points only.

### What the verification must establish

1. What is the actual intended destination (place name, purpose, and where it is)?
2. Is there a designated, lawful vehicle stopping or alighting location serving it (for example a terminal,
   stop or interchange area)? Where?
3. Does an accessible local road or a designated expressway exit connect to the intended destination?
4. Does a pedestrian connection from that stopping point to the destination exist, and is it legally
   accessible?
5. Would passengers have to walk on an expressway carriageway or shoulder, cross a restricted roadway, or use
   an unauthorized access point? (If yes, the current endpoint is not acceptable.)

### Record

| Item | Record |
|---|---|
| Intended destination (name, purpose) | |
| Location of intended destination (coordinates, if known) | |
| Designated lawful stopping / alighting location (name, coordinates) | |
| Source for the stopping location (official notice, operator, LGU, on-site sign) | |
| Local road or designated exit connecting to the destination | |
| Pedestrian connection exists? (yes / no / unknown) | |
| Pedestrian connection legally accessible? (yes / no / unknown) | |
| Any expressway carriageway, shoulder, restricted crossing or unauthorized access needed? (yes / no / unknown) | |
| Observations and limitations | |
| Photo / document references | |

### Outcome

| Item | Record |
|---|---|
| Safe and lawful connection established? (yes / no / unknown) | |
| If no or unknown | Mark the San Jose / Ibaan endpoint **unresolved** and recommend reconsidering the configured endpoint (any change needs a new diagnostic run). |

---

## C. Inspection record

Complete one record per inspection visit. Leave blank until an inspection actually takes place.

| Field | Record |
|---|---|
| Inspection date (YYYY-MM-DD) | |
| Time of day and weather | |
| Inspector name | |
| Inspector's authorized role and office | |
| Authorization or permission obtained (by whom) | |
| Segments or locations inspected | |
| Segments or locations not inspected, and why | |
| Observations | |
| Limitations of this inspection (for example one visit, daytime only) | |
| Public-access finding | |
| Usability finding | |
| Conditions and restrictions (hours, gates, user groups, seasonal limits) | |
| Supporting evidence references (committed files under `docs/routes/approvals/evidence/` or `docs/routes/`, or https links) | |
| Privacy check done (no identifiable people or plates) | |
| Follow-up actions | |

---

## D. Approval readiness

This checklist is a working aid. **A completed checklist is not, by itself, approval evidence**, and every
route remains not approved after it is filled in. Under approval schema `as-1`:

- **Campus exit.** The `campus-exit-unverified` warning can be resolved only by `on-site-inspection` evidence,
  recorded in the single shared evidence record `docs/routes/approvals/evidence/alangilan-campus-exit.json`.
  That record must:
  - list all three segments as `segmentsInspected`, written exactly as the warning names them:
    `(unnamed)`, `Neptune Street`, `Mercury Street`;
  - list all five corridors in `appliesToRoutes`: `lipa`, `batangas`, `bauan`, `sanjose`, `tanauan`;
  - give the inspection date, the inspector, at least one evidence reference, and its limitations.
- **Findings that can resolve the warning:** public access `public` or `public-with-conditions`, **and**
  usability `usable` or `usable-with-conditions`. A conditional finding must state its conditions, and every
  route's approval record must repeat those conditions exactly.
- **Findings that cannot:** public access `restricted`, `private`, `blocked` or `unknown`, or usability
  `unusable` or `unknown`, leave the warning unresolved — which blocks all five routes, because the routes are
  activated together or not at all.
- **San Jose / Ibaan.** The `endpoint-snap` and `endpoint-zone-not-reached` warnings cannot be resolved by a
  team decision. They need `map-review` or `on-site-inspection` evidence and an endpoint relationship that
  states the intended destination and explains why the accepted road endpoint serves it. That relationship
  must be defensible: if no safe, lawful alighting point and pedestrian connection exist, the endpoint stays
  unresolved and should be reconsidered.
- **Evidence references** must be https links or files committed under `docs/routes/approvals/evidence/` or
  `docs/routes/`. Local file paths are not accepted.
- After the evidence and the five approval records exist and are committed, `npm run routes:approve` checks the
  whole set. Nothing is activated in the app unless all five routes pass.
