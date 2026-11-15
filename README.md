# BIYAHE

**Know when to head home, and where to wait if you shouldn't.**

A zero-input, offline-first disaster-commute PWA for BatStateU Alangilan. Students get one answer in under ten seconds. Campus staff and the DRRMO triage corridors and safe spots in three clicks.

![Overview](docs/screens/overview.png)

## Two flows

**Student (zero input, ≤10-second decision)**

`Welcome` → `1-step corridor setup` → `Home`. Home says **Head Home Now** or **Wait on Campus for Now**, with the hazard-adjusted travel time against the usual one and a provenance badge (`Official`, `Estimate`, `Saved copy`). One tap from there:

- **See Where to Wait**: map and list of safe spots with live capacity, power / water / food, and walking time.
- **Share I'm Safe**: a pre-written family message (share sheet, SMS, or copy).
- **Alerts**: PAGASA, LGU and Campus advisories, filterable.
- **Profile & Offline**: offline storage status, Low-Battery Mode, demo scenario switcher.

**Staff / DRRMO (3-click triage)**

`Welcome` → `Staff / DRRMO quick access` → `Coordinator Command` (`#/coordinator`): corridor risk map, estimated stranded students per corridor (aggregated only, RA 10173), `−10 / +10` occupancy steppers and amenity toggles for CICS Lobby, Gymnasium and Library, and a one-click **Publish Campus / Corridor Advisory** dialog that reaches student views immediately.

## Run the demo

```bash
npm install
npm run dev        # http://localhost:5173
```

1. Open the app in **two tabs**.
2. Tab A: **Continue as Student**, pick a corridor, stay on Home.
3. Tab B: **Staff / DRRMO Demo** → **Open Command Dashboard**.
4. In tab B press `+10` on a safe spot, toggle an amenity, or publish an advisory that sets a corridor to Closed. Tab A updates at once and announces the new advisory.
5. In tab A, **Profile → Demo scenario** switches between `Clear`, `Disrupted`, `Stale >30m`, `Offline Saved Copy` and `Low Battery`.

Each tab remembers its own role, so the two can sit side by side. Without Supabase the tabs sync through `BroadcastChannel`, so they must be in the same browser.

To check the installable, offline build:

```bash
npm run build && npm run preview   # http://localhost:4173
```

Load it once, then go offline and reload: the app shell comes from the service worker and the last snapshot from IndexedDB.

## Live data (optional)

The app runs on demo data with no configuration. To sync across devices:

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor (PostGIS tables, Realtime publication, demo RLS policies).
2. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Restart `npm run dev`. Profile → Data connection shows which source is in use.

The write policies in the schema are open for the demo. Put them behind staff authentication before any real use.

| Source | Used for | Fallback |
|---|---|---|
| Supabase (PostgreSQL + PostGIS + Realtime) | Corridor status, safe spots, advisories | IndexedDB snapshot, fixtures in `src/data.ts` |
| Open-Meteo (13.7842, 121.0744) | Current weather | Last saved reading |
| PAGASA / Batangas City LGU | Advisory schemas (`PagasaAdvisory`, `LguAdvisory`) | Simulated fixtures; no live feed is wired |

## Design system

Tokens live in [`src/index.css`](src/index.css).

| Token | Value | Token | Value |
|---|---|---|---|
| `--deep` | `#0B2D5B` | `--ok` | `#15803D` |
| `--sky` | `#2563EB` | `--warn` | `#B45309` |
| `--sun` | `#FBBF24` | `--danger` | `#B91C1C` |
| `--cloud` | `#F8FAFC` | `--slate` | `#64748B` |

Type is Poppins (self-hosted, precached) with tabular numerals.

- **Status never relies on colour.** Open = check icon + solid line, Slow = clock + dotted line, Closed = triangle + dashed line, each with a text label.
- **Provenance is always visible.** `Official` (solid outline), `Estimate` (dotted), `Saved copy` (dashed, neutral).
- **Layout.** 360–430px: single column with a glass bottom nav. ≥900px: sticky side rail with a split panel and map for both roles.
- **Low-Battery Mode.** Offered when the battery drops under 20%, or toggled in the header or Profile. Drops map tiles and animation, raises text contrast, polls less often.
- **Accessibility.** Skip link, 48px touch targets, native modal dialog with focus trap, `aria-live` toasts, `prefers-reduced-motion`.

## Stack

React + TypeScript (Vite), `vite-plugin-pwa`, Leaflet / react-leaflet with OpenStreetMap, `@supabase/supabase-js`, lucide icons.

```bash
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

BeansDev (Team 11) · CS Bootcamp: Build the Way Forward
