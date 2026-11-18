# Alangilan route review — run 20261117T124418Z-45d1ea

Human review record. Maintained by hand; not generated and not overwritten by any script.

> **This document is not a route approval.** It records the project owner's map-review decisions and
> interpretations for continued evaluation. Every route below remains not approved for the app, and no automated warning
> is cleared, deleted or marked resolved by this document. Formal resolutions belong in the per-route approval
> records (`docs/routes/approvals/alangilan/<routeId>.json`) and the shared campus-exit evidence record, which do
> not exist yet. The app continues to use its five hand-drawn routes.

## 1. Run under review

| Item | Value |
|---|---|
| Run ID | `20261117T124418Z-45d1ea` |
| Diagnostic GeoJSON | `docs/routes/diagnostics/alangilan-candidates.DIAGNOSTIC.20261117T124418Z-45d1ea.geojson` (committed in `0d4aa8e`) |
| GeoJSON SHA-256 (exact file bytes) | `70df8461a670d3113524b524fcde322c030cf542d22202177fc5d51c1f86156e` |
| Diagnostic report | `docs/routes/alangilan-diagnostic.md` |
| Diagnostic format | `ds-1` |
| Versions | routing policy `rp-1`, geometry processing `gp-1`, warning schema `ws-1`, approval schema `as-1`, generator `2.1.0` |
| Routing | OSRM public demo server, `driving` profile, first route returned; destination bearing constraint on San Jose only |
| Consistency check | The stored analysis of all five routes was rebuilt from the diagnostic's raw OSRM data and re-run; every stored status, warning, geometry hash and metric equals the recomputed value. |
| Relation to earlier runs | Each route's geometry hash and warnings are identical to run `20261117T064232Z-640d24`, the run inspected in Review B of `docs/routes/alangilan-review-notes.md`. That history is kept unchanged in that file. |

Automated status of every route in this run: **NEEDS REVIEW**. This document does not change it.

## 2. Overall review decision

- **Decision:** the project owner has reviewed the five candidate routes on the map and considers their
  current corridor alignments **acceptable for continued evaluation**.
- **Kind of decision:** human map review (`map-review`).
- **Reviewer:** the project owner. Names are not recorded in this document; the formal approval records will
  carry the reviewer and review date.
- **Recorded:** 2026-11-17.

This decision is **not** evidence that:
- students actually use every road segment of these routes;
- any route is a public-transport (jeepney or bus) route — each remains not verified as one; OSRM's
  `driving` profile returns a fastest car route on the road network;
- any endpoint has been checked on site;
- any pedestrian connection is safe or accessible.

Unchanged by this review: corridor IDs, corridor names and app labels, configured endpoints, routing
parameters, diagnostic results, warnings and statuses.

## 3. Corridor decisions

Measured values below come from the committed diagnostic of this run.

| Route | App label | Configured end | OSRM road endpoint | Separation | OSRM distance | Primary-road share | Warnings (unchanged) |
|---|---|---|---|---|---|---|---|
| lipa (partial) | JP Laurel Hwy | 13.81, 121.07 | 13.810063, 121.069996 | 6.7 m | 3.81 km | 68.9% | `campus-exit-unverified` |
| batangas | P. Burgos | 13.7575, 121.058 | 13.75752, 121.0581 | 11.0 m | 4.47 km | 81.8% | `campus-exit-unverified` |
| bauan | Diversion Rd | 13.79, 121.02 | 13.790187, 121.019695 | 38.7 m | 9.72 km | 67.1% | `destination-overshoot` 430.1; `campus-exit-unverified` |
| sanjose | Batangas–Lipa Rd | 13.82, 121.115 | 13.819101, 121.116634 | 202.5 m | 8.01 km | 74.7% | `endpoint-snap` 202.7; `endpoint-zone-not-reached` 100; `snap-bearing-applied` {30, 45}; `campus-exit-unverified` |
| tanauan (partial) | STAR Tollway | 13.85, 121.095 | 13.850731, 121.094959 | 81.3 m | 9.67 km | 72.1% | `campus-exit-unverified` |

Observation for the later label review (no change made here): the roads OSRM chose do not all match the app
labels. Lipa uses National Highway 4 and Batangas-Balete Road (no road named JP Laurel Highway); San Jose uses
the Southern Tagalog Arterial Road (STAR); Tanauan uses President Jose P. Laurel Highway (not STAR); Bauan uses
Diversion Road only at the 116 m roundabout. Labels are outside the scope of this review.

### Lipa — accepted for continued evaluation
- Candidate geometry accepted for continued evaluation (map review).
- **Partial route.** The geometry ends 3.81 km from campus, on an unnamed road 6.7 m from the configured
  endpoint. It does **not** represent a complete journey to Lipa City.
- Campus-exit warning retained (section 5).

### Batangas — accepted for continued evaluation
- Candidate geometry accepted for continued evaluation (map review).
- Endpoint and alignment unchanged: the route ends on P. Burgos Street, 11.0 m from the configured endpoint,
  after National Highway 4.
- Campus-exit warning retained (section 5).

### Bauan — accepted for continued evaluation, with the overshoot as an accepted map-review limitation
- Candidate geometry accepted for continued evaluation (map review), **despite the 430.1 m destination
  overshoot**.
- The loop, as measured: the route enters the 100 m zone around the configured end (13.79, 121.02) at
  13.789348, 121.020637 and passes 75.2 m from it at 13.789913, 121.020691. It continues north to 13.790617,
  121.020767, west 229 m to 13.790518, 121.018649 — past the destination — then south and back east 111 m to
  the OSRM road endpoint 13.790187, 121.019695. Inside the zone it travels 530.1 m where the direct distance is
  100 m.
- **Decision:** this loop and detour are recorded as an **accepted map-review limitation for this
  candidate**. The cause (minor-road access, one-way rules, turn restrictions or OSM data) is not established
  by the diagnostic data.
- The `destination-overshoot` warning is **not hidden, removed or cleared**. Its formal resolution
  (outcome `accepted-limitation`, evidence type `map-review`) is still to be written in the Bauan approval
  record.
- Configured destination unchanged; the route was not regenerated.
- Campus-exit warning retained (section 5).

### San Jose / Ibaan — vehicle route plus a pedestrian last-mile connection (pending)
- Candidate geometry accepted for continued evaluation (map review).
- Measured facts:
  - Configured destination: **[13.82, 121.115]**.
  - OSRM road endpoint: **[13.819101, 121.116634]** on the Southern Tagalog Arterial Road (E2), northbound
    carriageway; rounded to 5 decimals: [13.8191, 121.11663].
  - Separation: **202.5 m**; the configured destination lies 299.5° (WNW) of the road endpoint.
  - The route never comes closer than 202.8 m to the configured destination, so it never enters the 100 m
    destination zone.
  - Final approach 30.1° (NNE), produced with the destination bearing constraint 30° ± 45°.
- Interpretation recorded by the project owner:
  - The configured destination appears to lie **off the drivable road network**.
  - The intended arrangement is **a vehicle route ending at the nearest mapped road, followed by a pedestrian
    last-mile connection** to the destination.
- **Vehicle route vs walking connection.** The route geometry in the diagnostic covers the vehicle part only,
  ending at the OSRM road endpoint. The walking connection between that endpoint and the destination is
  **not** part of the route, is not drawn, and is not verified. No pedestrian route is claimed.
- **Still requires confirmation:**
  - that a safe, accessible walking connection exists from where passengers alight to the destination;
  - that passengers would **not** have to alight on, or walk along, a restricted expressway carriageway or
    shoulder. The OSRM endpoint is on the STAR mainline; whether a legal and safe alighting point exists there
    or nearby is not established by the data.
- Map-review rationale (for the later formal resolutions):
  - `endpoint-snap` (202.7 m) and `endpoint-zone-not-reached` (100 m zone): the destination is off the
    drivable network; the nearest road point reached is the OSRM endpoint above.
  - `snap-bearing-applied` (30° ± 45°): the constraint keeps the snap on the northbound carriageway; the
    measured final approach (30.1°, NNE) is consistent with northbound travel.
- **Formal resolutions pending.** These three warnings stay open until the approval record and its evidence
  are prepared. Under the `as-1` rules, the two endpoint warnings cannot be resolved by a team decision; each
  needs `map-review` or `on-site-inspection` evidence and an endpoint relationship. The pedestrian-safety
  confirmation above should be settled before those resolutions are written.
- Campus-exit warning retained (section 5).

### Tanauan — accepted for continued evaluation
- Candidate geometry accepted for continued evaluation (map review).
- **Partial route.** The geometry ends 9.67 km from campus, on Charito Makalintal Road 81.3 m from the
  configured endpoint. It does **not** represent a complete journey to Tanauan.
- Noted from the data: the route continues about 407 m north of the configured endpoint on President Jose P.
  Laurel Highway, then returns 675 m south-south-east on Charito Makalintal Road. No warning is raised for this
  (the overshoot check only measures inside the 100 m zone).
- Campus-exit warning retained (section 5).

## 4. Accepted map-review interpretations vs unresolved physical-access evidence

| Accepted for continued evaluation (map review, this document) | Still unresolved (needs physical-access evidence or formal records) |
|---|---|
| Corridor alignments of all five candidates | Campus exit — all five routes (section 5) |
| Lipa and Tanauan as partial route segments | San Jose: safe, legal alighting point and walking connection to the destination |
| Bauan's 430.1 m loop as a map-review limitation of this candidate | San Jose: formal resolutions of `endpoint-snap`, `endpoint-zone-not-reached` and `snap-bearing-applied` |
| San Jose interpreted as vehicle route plus pedestrian last mile | Bauan: formal `destination-overshoot` resolution in its approval record |
| | Every route: an approval record; none exists yet |

## 5. Shared campus exit — unresolved blocker for all five routes

All five routes leave campus by the same 813.6 m approach before reaching National Highway 4. Its geometry is
identical in every route:

| Order | Segment (as the warning names it) | Length (OSRM) | From → to [lat, lng] |
|---|---|---|---|
| 1 | `(unnamed)` | 132.5 m | 13.784193, 121.074282 → 13.785388, 121.074209 |
| 2 | Neptune Street | 410.1 m | 13.785388, 121.074209 → 13.786551, 121.071675 |
| 3 | Mercury Street | 271.0 m | 13.786551, 121.071675 → 13.786623, 121.069199 |
| — | joins National Highway 4 | — | at 13.786623, 121.069199 |

The `campus-exit-unverified` warning stays **unresolved on all five routes** and blocks approval of the whole
set (activation is all five routes or none). A road name or OSM classification is not evidence of public
access.

**Required evidence.** An `on-site-inspection`, recorded in the shared evidence record
`docs/routes/approvals/evidence/alangilan-campus-exit.json`, covering all three segments exactly as named above
(`(unnamed)`, Neptune Street, Mercury Street) and establishing:
- whether each segment is publicly accessible;
- whether students can actually use the approach;
- any gate, access restriction or opening hours, and the surface, lighting and other relevant conditions;
- whether the approach connects safely to National Highway 4.

The approval rules accept the warning only if public access is `public` or `public-with-conditions` and
usability is `usable` or `usable-with-conditions`; conditional findings must state their conditions, and each
route record must repeat them exactly. A finding of `restricted`, `private`, `blocked`, `unusable` or
`unknown` keeps the warning unresolved.

The inspection must be carried out by authorized personnel (for example campus security or the DRRM office),
with permission where needed. No one should enter restricted property or inspect an expressway roadway to
produce this evidence. Photographs must not show identifiable people or vehicle plates (RA 10173).

No inspection has been recorded. This document contains no field observations, inspection dates or evidence
references.

## 6. Known limitations

- OSRM's `driving` profile gives a fastest car route, not jeepney or bus routes.
- Visual map review shows how a route lines up with mapped roads; it is not evidence of what students ride,
  of public access, or of pedestrian safety.
- Primary-road shares are matched by road name only and are an inspection aid, not proof.
- Lipa and Tanauan are partial segments, not complete journeys.
- The app labels were not reviewed here (see the observation in section 3).

## 7. Next steps (not started)

1. San Jose: confirm a safe, legal alighting point and walking connection; then decide whether the current
   endpoint is kept with documented endpoint relationships, or the configured destination is changed (which
   needs a new diagnostic run).
2. Campus exit: on-site inspection by authorized personnel, recorded in the shared evidence file.
3. Review the app labels against the roads the candidates use.
4. Write the five approval records for this run, commit them with the evidence, and validate with
   `npm run routes:approve`.

Any change to a configured endpoint means a new run; all five approval records must cite the same run, so
endpoint decisions should be settled before the records are written.
