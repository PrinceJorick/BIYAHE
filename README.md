# BIYAHE

**Safer journeys. Brighter tomorrows.** Know when to head home, and where to wait if you shouldn't.

A zero-input, offline-first disaster-commute PWA for BatStateU Alangilan, Pablo Borbon and JPLPC-Malvar. Students get one answer in under ten seconds. Campus staff and the DRRMO triage routes and safe spots in three clicks.

Full documentation: [`docs/BIYAHE-Documentation.md`](docs/BIYAHE-Documentation.md) (also as [PDF](docs/BIYAHE-Documentation.pdf); rebuild it with `npm run docs:pdf`, which needs Python `markdown` and Chrome or Chromium).

| Home | Details | Map | Alerts |
|---|---|---|---|
| ![Home](docs/screens/02-home.png) | ![Details](docs/screens/03-details-route.png) | ![Map](docs/screens/06-map-open.png) | ![Alerts](docs/screens/07-alerts.png) |

## Two flows

**Student (zero input, ≤10-second decision)**

`Welcome` (**Get started**) → `Setup` (campus and route home, once) → `Home`. Four tabs: **Home, Map, Alerts, Settings** (bottom bar on phones, Deep Blue side rail from 900 px).

- **Home**: weather and date with the chance of rain for the next hours, traffic flow on your route, one local weather headline when there is one, *Where do you want to go?* (three suggestions: head home, the nearest safe spot, another route; a closed route is never recommended), *Why this suggestion* (the rule and facts behind the first option), and every route home and safe spot.
- **Details** (`#/go/route/<id>`, `#/go/spot/<id>`): the answer (*Head home now.* / *Wait on campus for now.*), travel time now against the usual time, notifications (advisories, forecast and traffic notices, local news) and the nearest places to go.
- **Map** (`#/map/…`): full screen above the tab bar. The place sits in a chip at the top-left; **Show details** opens the trip panel: trip time, **When should I leave?** (now, +30 min, +1 h, +2 h with traffic and rain chance), places, and map layers (all routes, live traffic). On wide screens the panel is docked on the left, open.
- **Alerts**: advisory cards from PAGASA, the LGU and the campus, forecast and traffic notices, and local news, with filters (`#/alerts?filter=news` opens Local news).
- **Share I'm safe**: a pre-written family message (share sheet, SMS, or copy).
- **Settings**: usual route, which alerts are announced, offline data (**Sync now**, **Clear offline data**), Low-Battery Mode, demo scenarios, privacy, build info and switching role. `#/profile` (the old Profile page) opens Settings.

Every route shows one of four statuses from one shared rule (`src/lib/routeStatus.ts`), on every screen and map:

| Condition | Status | Student message |
|---|---|---|
| Flooded or closed | **Closed** | Route is flooded. Do not proceed through this route. |
| No hazard | **Clear** | Route is clear. You may proceed home. |
| Ponding or heavy traffic | **Slow** | Route is open but slow. Allow extra time. |
| No report, or data older than 30 min | **Unknown** | Unable to confirm route conditions. Verify the latest available advisory. |

A closed route stays closed when its data ages; a clear one becomes Unknown. Only Clear or Slow routes are ever suggested.

**Staff / DRRMO (3-click triage)**

`Welcome` → **Campus staff** → `Staff access` (campus and role) → `Coordinator Command` (`#/coordinator`): route map and status per route with estimated stranded students (aggregated only, RA 10173), safe spots with campus totals (capacity, spaces left, not assessed), headcount steppers and amenity toggles, local news (sample reports marked *Simulated* when no live report is available; the "verify before publishing" warning stays), and the **advisory board**, laid out like a Todoist board: three collapsible columns, *Drafts* (hidden from students) → *Active* (students see them) → *Resolved* (resolved, discarded or expired). Cards show a severity circle (on active cards it resolves), the headline, a one-line description and a meta row, with a ··· menu (Edit, Publish, Resolve, Discard, Reuse as draft). Each column has its own add row: **Add draft** (saves only), **Publish advisory** (publishes only) and **Resolve advisory** (pick an active one), alongside **New advisory** at the top. Enter in the form never publishes. Staff **Settings** (`#/settings`): role (and building for a marshal), campus, offline and sync, Low-Battery Mode, demo scenarios, privacy and build info.

| Role | Safe spots | Advisories | Tasks shown on Command |
|---|---|---|---|
| DRRMO Coordinator | Every spot: headcount ±10 and amenities | Create, publish, edit, resolve | Publish, update and resolve advisories; set route status; watch space |
| Building Marshal | **One assigned building** (picked at staff access or in Settings; defaults to the campus's first spot): headcount ±10 and amenities. Other spots read-only | View only | Keep your building's headcount current; mark power, water and food |
| Guard on Duty | Every spot: headcount **±1** (door count) and ±10. Amenities read-only | View only | Count people in and out; send people from a full spot to the next |

Permissions are checked in the store (`canEditOccupancy`, `canEditAmenities`), not only in the UI. There is still no staff sign-in, so this is demo gating, not access control.

When the coordinator publishes, edits or resolves an advisory, every open student view updates at once (other tabs on the device through BroadcastChannel; other phones and laptops through Supabase Realtime, about 1.5 s, verified 28 November 2026), and the student gets one notice: their route's new status, a new advisory, an update, or a resolution (`src/lib/studentNotice.ts`).

In the code and database a route is called a corridor (`Corridor`, `corridor_status`); the UI says "route".

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Everything works with no keys (demo data, the app's own map over OpenStreetMap tiles, estimated traffic; weather and news show as unavailable). To turn on the street map, live traffic, weather and local news, fill in **`.env`** (git-ignored; template in [`.env.example`](.env.example)):

| Variable | What for | Where to get it |
|---|---|---|
| `VITE_GOOGLE_MAPS_API_KEY` | Google street map, live traffic layer, traffic-aware trip times and road-following routes | Google Cloud Console: enable **Maps JavaScript API** and **Routes API**, create a key restricted to your sites and those two APIs |
| `VITE_GOOGLE_MAPS_MAP_ID` | Optional cloud-styled vector map | Google Maps Platform → Map management |
| `VITE_GOOGLE_ROUTES_API_KEY` | Optional separate browser key for the Routes API (falls back to the Maps key) | Same console, restricted to your sites and **Routes API** |
| `CURRENTS_API_KEY` | Local news via `/api/news` (server only) | [currentsapi.services](https://currentsapi.services) (free: 250 requests/day) |
| `VITE_GOOGLE_WEATHER_API_KEY` | Weather, hourly rain chance and PAGASA alerts, asked from the browser (falls back to the Maps key, then to the server key) | Google Cloud: enable **Weather API**; key restricted to your sites and **Weather API**; set a quota and budget alert (billable) |
| `GOOGLE_WEATHER_API_KEY` | The same via `/api/weather` (server only), used when the build has no browser weather key | Same API; the same website restriction works, because the server sends its own site address as the `Referer` |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Shared live data across devices | Supabase project; run `supabase/schema.sql` then `supabase/migrations/*.sql` |
| `VITE_WALK_ROUTER_URL` | Optional own OSRM foot router | Leave unset for the public FOSSGIS router |

Restart `npm run dev` after editing `.env`. Settings → *About this build* shows whether the browser-side Google Maps and Supabase keys are present (never their values); server keys are not visible to the browser. `VITE_*` values end up in the browser bundle, so restrict them in the provider console. Keys without the prefix stay on the server (`api/*.ts`: Vercel Functions in production, Vite middleware locally).

**Live backend:** Supabase project `biyahe` (ap-southeast-1) holds the shared demo data; `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable key) are set in Vercel for production, preview and development. A successful read confirms the data as of that moment, and the app re-reads every 10 minutes, so a quiet hour never turns routes *Unknown*; only failing to reach the server does. The tables allow writes with the publishable key ("demo write" RLS policies, no staff sign-in), so anyone with the app can change the shared demo data.

**Demo:** open the app on two devices (or two browsers). Tab A: *Get started*. Tab B: *Campus staff* → *Open Command Dashboard*. Changes in B (occupancy, amenities, an advisory that closes a route) appear in A at once. Settings → *Demo scenarios* switches between Clear, Flooding, Stale data, Offline and Low battery. *Flooding* places one simulated flood and several ponding sites per campus (`DEMO_HAZARDS` in `src/data.ts`, each on the road it names), so **every route is closed or in heavy traffic**: every route that passes the flood is closed and gets its own LGU advisory, every other route passes a ponding site and is slow (heavy traffic) (`src/lib/hazards.ts`). Simulated advisories carry a *Simulated* badge. *Clear* and *Flooding* are shared: they rewrite the demo campus data on every device through Supabase (Stale data, Offline and Low battery stay on the device). Every map also has a **Demo · Clear / Flooding** switch (bottom-left, or bottom-right on the full map) for the same thing; it shows the state the data is in, so it stays right when another device switches it. This only makes sense because every campus record is demo data (`DEMO_DATA` in `src/lib/store.ts`); a real feed must turn it off.

```bash
npm test           # Vitest
npm run lint       # oxlint
npm run build      # type check + production build
npm run preview    # http://localhost:4173, the installable offline build
```

## Data sources

| Source | Used for | Fallback |
|---|---|---|
| Google Maps JavaScript API | Street map whenever online (also in Low-Battery Mode, without the traffic layer), live traffic layer | Offline: the app's own map over saved OpenStreetMap tiles. Online without a key, or when Google refuses it: the same map over live OpenStreetMap tiles |
| OpenStreetMap tiles | Streets on the app's own map, online and offline | Saved tiles (zoom-13 streets stretched under closer zooms); plain background where nothing was saved |
| Google Routes API | Traffic-aware trip times, Google road geometry, traffic forecast for later departures | Times estimated from route reports |
| Google Weather API (browser key, else `/api/weather`) | Current conditions, hourly chance of rain (Estimate), PAGASA public alerts (Official) | Last reading as a saved copy (cached up to 24 h); otherwise "Weather unavailable" with **Retry**, or "Weather feed not configured for this build" when no key exists |
| Currents News API (via `/api/news`) | Local Batangas news, matched to campus and route by place | Saved copy for up to 24 hours, then none |
| Supabase (PostgreSQL + PostGIS + Realtime) | Route status, safe spots, advisories | IndexedDB snapshot, fixtures in `src/data.ts` |
| OSRM foot router (FOSSGIS) | Walking route to a safe spot | Saved route, then straight-line estimate |
| PAGASA / Batangas City LGU | Advisory schemas | Simulated fixtures; no public feed exists |

Official status always wins: a route the DRRMO or LGU closed shows *Closed* whatever traffic data says. Weather (20 min) and traffic-aware routes (10 min) are reused from a small device cache (`src/lib/apiCache.ts`, at most 24 h, one request per key in flight, manual refresh cooldowns of 60 s and 30 s, no retries on 429/403), and Google map tiles are never cached (Google Maps Platform terms). OpenStreetMap tiles are cached for 30 days (`osm-tiles`), and once a week a fixed set is saved for the offline map of **every** campus (`src/lib/offlineTiles.ts`, about 320 tiles, 203 of them at zoom 13+): zoom 9–11 with a wide margin and 12–13 over each campus's routes, and zoom 14–16 within about a kilometre of each campus. The map draws a zoom-13 base layer stretched under closer zooms, so an unsaved close tile shows softer streets, never a blank grid. News shows the publisher, time and original link with Currents attribution; article text is never fetched and never sent to an AI model.

## Campuses, routes and safe spots

| Campus | Routes |
|---|---|
| Alangilan | Lipa, Batangas City proper, Bauan / San Pascual, San Jose / Ibaan, Tanauan / Sto. Tomas, Rosario |
| Pablo Borbon | Lipa, San Jose, Bauan / San Pascual, Ibaan / Rosario, Lemery / Taal |
| JPLPC-Malvar | Lipa, Tanauan, Sto. Tomas, Batangas City, Balete |

Every route follows roads from campus to its town (`npm run routes:campuses`, OSRM over OpenStreetMap, validated at runtime). The Alangilan routes previously stopped at the old hand-drawn corridor ends, 3–26 km short of their towns; they are now full trips (`src/campuses/alangilan.trip.roads.ts`, e.g. Lipa 25.5 km, Tanauan 39.8 km via STAR Tollway). With a Google key the map draws Google's route for the same trip.

Rosario, Lemery / Taal and Balete were added on 2026-11-26 after checking which commuter corridors lacked a route (see *Route coverage review* in the [documentation](docs/BIYAHE-Documentation.md#route-coverage-review-26-november-2026)). The formal Alangilan approval workflow (`docs/routes/approvals`) still covers only the original five routes.

Safe spots (coordinates are the project owner's, at full precision, checked against OpenStreetMap on 2026-11-19):

| Campus | Safe spot | Latitude | Longitude | Capacity | OSM check |
|---|---|---:|---:|---:|---|
| Alangilan | Student Lounge (formerly CICS Lobby) | 13.78393267903075 | 121.07417575704717 | about 150 (needs review) | On campus, beside the CICS building and Sparta Gym |
| Alangilan | Sparta Gymnasium | 13.784276340529747 | 121.07413074951742 | 1,030 | Inside the gym footprint |
| Alangilan | Einstein Bldg Library, 2nd Floor | 13.784168707874697 | 121.0749349027738 | 250 (needs review) | Inside the Albert Einstein Building |
| Pablo Borbon | Felistiano "Sanoy" Leviste Multi-Purpose Gymnasium | 13.753079262668649 | 121.05277271784234 | 570 | Inside the gym footprint (OSM spells it *Feliciano*) |
| Pablo Borbon | Main Library | 13.754549329790514 | 121.0525887000107 | 230 | Inside the Main Library |
| JPLPC-Malvar | Gymnasium | 14.044572113490197 | 121.15574880496467 | not assessed | Inside a campus building |

Capacity is usable floor area × usable share (0.75 hall, 0.6 library) ÷ 2 m² per person, rounded down to 10, computed in one place (`estimateCapacity` in `src/campuses/capacity.ts`) from each spot's recorded footprint (`*_FOOTPRINTS` in the campus files). Footprints re-measured from OpenStreetMap on 2026-11-28: Sparta Gymnasium 2,773 m² → 1,030; Leviste Gymnasium 1,537 m² → 570; Main Library 776 m² (one floor) → 230. The Einstein library's 860 m² is an estimate from imagery, and the Student Lounge's 150 is the project owner's headcount estimate (2026-11-28); both are flagged *needs review* on the staff screen. Campus totals: Alangilan 1,430, Pablo Borbon 800, Malvar not assessed. `capacity.test.ts` checks each capacity against its footprint and each total against its spots. Names, positions and capacities belong to the app (`src/campuses`); saved copies, other tabs and Supabase rows supply only occupancy and amenities (`src/lib/spotData.ts`).

## Brand and design system

The logo is **Go Pin** (BIYAHE Brand Guidelines artboard): a map pin holding a forward arrow, with the rising sun, on a Deep Blue tile. `src/components/Logo.tsx` holds the mark, app icon and lockup, drawn from `src/components/logoGeometry.ts`; `npm run icons` regenerates the favicon and PWA icons from the same geometry (needs `rsvg-convert`).

Tokens live in [`src/index.css`](src/index.css): Deep Blue `#0B2D5B`, Sky Blue `#2563EB`, Sun Yellow `#FBBF24`, Cloud White `#F8FAFC`, Slate Gray `#64748B`. Type is Poppins only, with tabular numerals.

- **Neutral surfaces.** White cards with a hairline border on a light slate page; no tinted panels or coloured highlights.
- **Level colours are text only.** Green / amber / red (`.lvl-low`, `.lvl-mid`, `.lvl-high`) appear only on words that report a level, low to high: traffic, route status, rain chance, severity, a full safe spot. Every level also has a word, and route lines use solid / dotted / dashed patterns.
- **One rhythm.** One gap between every widget on a page (16 px, 20 px from 900 px) and one card padding; a clear type scale (display, H1, H2, H3/body, meta, caption, eyebrow).
- **Layout.** Phones: single column, bottom tab bar, full-screen map whose trip panel opens over the top of it. From 900 px: Deep Blue side rail; Home in two columns; details with the map beside them; the map's trip panel docked on the left.
- **Accessibility.** Skip link, 44–48 px targets, native modal dialogs, `aria-live` toasts, `prefers-reduced-motion`, Low-Battery Mode. Map labels never cover pins or each other (hidden until there is room).

## Updates, offline data and deep links

- The service worker (`vite-plugin-pwa`) precaches the app shell and fonts and activates new versions at once (`src/lib/pwa.ts`, loop-guarded). The dev server removes any worker a previous `vite preview` left on its origin.
- IndexedDB (`src/lib/idb.ts`, v2) keeps the snapshot, weather, news and walking routes for offline use.
- Routes use the hash (`#/map/route/lipa`). Path links such as `/map`, `/go/spot/gym` or `/profile` (now Settings) are rewritten on load; `vercel.json` serves `index.html` for every path except `/api/*`.

## Stack

React 19 + TypeScript (Vite 8), `vite-plugin-pwa`, Google Maps JavaScript API + Routes API, Leaflet (the app's own map: OpenStreetMap tiles or plain), `@supabase/supabase-js`, lucide icons, Vercel Functions (`api/news.ts`, `api/weather.ts`).

BeansDev (Team 11) · CS Bootcamp: Build the Way Forward
