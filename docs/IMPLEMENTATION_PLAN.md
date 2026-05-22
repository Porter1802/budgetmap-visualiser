# QLD Capital Investment Atlas — Implementation Plan

How to get from the current static POC (v0.3) to roughly the platform described in
`docs/spec-v0.2.md` (§-references below point at that spec). This is a learning
project, so the plan optimises for *learning each tool properly* over shipping fast,
but it sequences the work so every phase ends with something that runs.

---

## Decisions locked (2026-05-22)

These resolve the outstanding questions and override anything looser below:

1. **API access — public.** The capital-projects API is public, so **Dagster pulls it live**
   on a schedule. No manual-dump workflow. The orchestration layer earns its keep. (settles §7.9)
2. **History — deferred.** Historical packages are a *future enhancement*, not in initial scope.
   `package_id`/`financial_year` columns still exist (set at ingest) but `mart_project_history`
   and per-year `data.qld.gov.au` back-loading are parked. (settles §7.10)
3. **WKT is coming ~June, into the main `/api/projects`.** Not hypothetical — design *and build*
   the geometry-aware path now (§0a), don't just stub it. Lines/polygons/buffers should be ready
   to light up the moment the June payload lands.
4. **Migrations — sqitch.** Use sqitch (not ad-hoc numbered SQL) for `db/` — proper
   deploy/revert/verify, and a deliberate learning pick.
5. **FastAPI from the start.** `apps/api` stands up in **Phase 2**, not Phase 6. `/sa2/[code]`
   reads marts through FastAPI from day one — no Next.js-route-handler interim.
6. **Dark theme early.** Do the dark MapLibre restyle (spec §5.1) up front in **Phase 1**, not as
   Phase 7 polish. Skip the QGDS-light interim.

---

## Build status (2026-05-22)

All seven phases scaffolded and committed. Validated against a real PostGIS 3.4 +
pgRouting 3.6 + H3 4.1 stack (apt-installed in CI; the homelab uses the compose
`db` service). Martin/MinIO/Authentik/Traefik/Marquez are code-complete but only
provable on the homelab (no Docker daemon in CI).

| Phase | State | Validated here |
|-------|-------|----------------|
| 0 Foundation | done | sqitch deploy+verify of 7 migrations; web build green |
| 1 Ingest/tiles/map | done | projects ingest live (2056 proj / 1204 loc / 6396 funding); SA2 overlap math proven on synthetic line+polygon; dagster validate; dark theme builds. Martin = homelab |
| 2 Marts/Soda/API/SA2 | done | dbt build PASS=30; Soda 9/9; FastAPI health+hexbin+project; /sa2 builds |
| 3 Context layers | done | schools loader 1774 rows from data.qld; context assets validate. ABS/QPS feeds = homelab |
| 4 Transit | done | pgr_drivingDistance proven; migration 0007 deploy+verify; GTFS loader written; mart transit score. Full isochrones need GTFS = homelab |
| 5 Risk/3D | done | flood exposure + canopy mart columns build; risk assets validate. 3D extrude = frontend follow-up |
| 6 Lakehouse | done | GeoParquet export + DuckDB roundtrip; H3 benchmark (666 hexes both engines; PostGIS 30ms vs DuckDB 572ms); /analytics endpoint |
| 7 Polish/auth | done | /compare + /sa2 build; Traefik+Authentik config; Marquez wired. Auth round-trip = homelab |

Loose ends deferred by design: SA2/LGA/electorate boundaries need the ABS
download (loaders ready, `SA2_GEOJSON` env), which lights up `mart_sa2_summary`,
the SA2 page, and choropleths; historical packages (decision #2); 3D extrusion
and choropleth toggles on `/atlas`; the GTFS-realtime `TripsLayer` stretch.

---

## 0. The one thing that changes everything: the data gap

The v0.2 spec was written against the **internal Treasury / Databricks schema**.
The v0.3 POC then hit the **public API** and found it is much thinner. This is
verified, not assumed (see `README.md` and `scripts/fetch_projects.py`):

| Spec §3 assumption | Public-API reality (verified 2026-05) | Consequence for the plan |
|---|---|---|
| `projects.locations[]` (1:N) with WKT | `/api/projects` has **no** `locations[]`; geometry is a single project-level `latitude`/`longitude`. `/api/bp3projects` *does* have `locations[]` but lat/long only, no WKT | The 1:N project→location model only partly exists. We **synthesise** `project_locations` (one point per project, plus bp3 multi-location) rather than ingest it — but keep it a *real 1:N table* so richer geometry slots in without a remodel |
| `geometry_wkt` / lines / polygons / `impactRadius` | Points only today. No WKT, no lines/polygons, no impact radius **yet** | **Design forward for WKT (see below).** `geom` stays `geometry(Geometry,4326)` (not `Point`); `geometry_wkt`/`geometry_geojson`/`geometry_type`/`impact_radius_m`/`geom_buffered` columns all exist and are **nullable** — populated when WKT lands, NULL until then. PathLayer/PolygonLayer (spec §5.2) ship dormant and light up with the data |
| 5-way funding split | **Present** on `/api/projects` (`totalQldFunding` … `totalPrivateFunding`). **Absent** on bp3 (single `budgetValue` in thousands) | `project_funding` is real for `/api/projects` rows; bp3 rows get one synthetic `qld`/unknown row |
| SA2 is native-ish | Native tags are **RDP region / SA4 / SED / LGA**. No SA2 anywhere | SA2 is *fully derived* by spatial join (spec §3.2). RDP (22 regions, codes 301–322) is the only ready-made admin unit and stays the POC's primary filter until SA2 joins exist |
| `package.financialYear` + `versionNumber`; historical packages by `package_id` | Public API appears to be **current-year only**; no package/version surfaced | Historical depth (spec datasets #3) likely needs `data.qld.gov.au` per-year dumps, not the live API. Treat `package_id` as a column we *control* at ingest, not one the API gives us |
| `status` / `entryState` enums | `status` is an int; published package exposes **only `2`** | Can't filter live/withdrawn from public data. The status dimension is inert until internal access |
| 4 description fields | Single `description` | No canonical-description choice to make (spec §7.1 is moot for public data) |

**Decision the project owner must make before Phase 1 (drives everything):**

- **Path A — public data only.** Build the *whole stack* (Postgres→dbt→marts→tiles→Next.js)
  but feed it the thin public payload. Honest, fully reproducible, learns every tool.
  Lines/polygons/impact-radius/multi-version/status-filtering ship **dormant** (schema + code
  present, no rows) until data exists.
- **Path B — internal Treasury access.** Realises spec §3 in full. Needs network access
  from Dagster into Treasury (spec §7.9) + historical packages (§7.10). Out of our hands here.

**This plan assumes Path A but designs for Path B** — see §0a. The platform is real and runnable
now on public data, with the richer schema as a no-migration drop-in later.

### 0a. We assume WKT geometry arrives eventually — so design for it now

The owner's call (now firmer than "assume"): **WKT is expected ~June 2026 in the main
`/api/projects` payload.** So this isn't speculative forward-design — it's near-term, and the
geometry path is *built*, not stubbed. The cost of designing for it up front is near-zero;
the cost of retrofitting it later (re-typing geometry columns, back-filling a 1:N table, reworking
tile layers) is high. So Path A is built *WKT-shaped* from day one:

- **`project_locations` is a true 1:N table** even though today it holds ~one synthesised point
  per project. When `locations[]` with WKT appears, ingest writes N rows per project — no schema
  change, the `project_location_sa2` join already handles many-SA2-per-project.
- **`geom` is `geometry(Geometry,4326)`**, not `Point`. A LineString/Polygon stored later needs no
  column change or table rewrite. The GIST index already covers all geometry types.
- **`geometry_wkt` / `geometry_geojson` / `geometry_type` / `impact_radius_m` / `geom_buffered`
  columns exist and are nullable** from Phase 1. The ingest asset parses WKT → `geom` and computes
  `geom_buffered = ST_Buffer(geom::geography, impact_radius_m)` *only when those fields are
  populated*; otherwise it falls back to the lat/long point. One code path, both worlds.
- **`overlap_fraction` in `project_location_sa2` is real logic, not a constant.** For points it's
  1.0; the line/polygon area-overlap calculation is written and tested against synthetic geometry
  in Phase 2 so it's correct the day real lines/polygons land — funding splits across SA2s honestly
  with no rework.
- **deck.gl `PathLayer` / `PolygonLayer` are wired but render nothing** while their tile sources are
  empty. When WKT rows appear they draw automatically (width/extrusion = log spend per spec §5.2).
- **`mart_*` models reference the full geometry-aware shape** so marts don't need re-authoring when
  geometry richens; only the underlying row counts change.

Net: a future WKT feed is a *data event*, not a *migration event*.

---

## 1. Where we are vs where we're going

**Now (v0.3 POC):** static Next.js 15 / MapLibre / deck.gl app. `scripts/fetch_projects.py`
pulls the public API + open-data facilities, runs point-in-polygon region tagging in pure
Python, and writes `public/data/{projects,regions}.geojson` + `meta.json`. nginx serves the
static export. 2,857 mapped point features (445 capital, 640 other, 1,249 school, 336 police,
187 hospital), 22 RDP regions, ~$18.7b funding. No database, no tiles server, no marts.

**Target (Atlas v0.2):** Postgres+PostGIS canonical store → Dagster-orchestrated ingest →
dbt marts → Martin vector tiles + PMTiles → FastAPI → Next.js multi-page atlas, with a
DuckDB/GeoParquet/MinIO lakehouse mirror, all behind Authentik on the homelab.

The POC is **not throwaway**. It already encodes hard-won knowledge we carry forward:
- The ingest logic in `fetch_projects.py` (funding rollup, agency `(Archived)` stripping,
  RDP point-in-polygon, Nominatim hospital geocoding + on-disk cache) becomes the body of the
  first Dagster assets — moved into SQL/Python ops, not rewritten from scratch.
- The QGDS palette / `tokens.ts` / custom MapLibre style and the deck.gl layer code are the
  frontend's starting point. Per locked decision #6 the dark restyle happens in Phase 1 (not
  Phase 7), but the layer wiring carries over regardless.
- The verified API quirks table above is the ingest spec.

---

## 2. Infrastructure reality

This repo runs in an ephemeral cloud container; the **homelab (porterble.com: Proxmox,
Traefik, Authentik)** is the real deployment target. So:

- **Built and committed in-repo, testable here:** SQL DDL + migrations, dbt project, Dagster
  asset code, FastAPI app, Soda checks, the Next.js frontend, `docker-compose` for the whole
  stack. Postgres/PostGIS, DuckDB, and Martin *can* be run locally in a dev container for
  integration testing; Dagster/dbt run against that local Postgres.
- **Only validatable on the homelab:** Traefik routes, Authentik forward-auth, MinIO, the
  PBS backups, Loki logs, public DNS. The plan produces the compose/config for these but
  end-to-end auth/routing is verified on porterble.com, not here.
- Everything stays as Docker Compose stacks (spec §8) so it's portable between this container
  and the VM.

Proposed repo layout (monorepo, evolve the current Next.js root into `apps/web`):

```
/                    # docker-compose.yml, README, docs/
  apps/
    web/             # Next.js 15 (current src/ moves here)
    api/             # FastAPI + DuckDB
  ingest/            # Dagster project (assets, ops, OpenLineage)
  transform/         # dbt-core project (sources, staging, marts)
  db/                # PostGIS DDL + migrations (sqitch — decision #4)
  quality/           # Soda Core checks
  tiles/             # Martin config; PMTiles export scripts
  infra/             # compose files, Traefik labels, Authentik notes
```

---

## 3. Phased plan

Phases mirror spec §6 but are re-scoped for Path A and for "what's buildable/testable here vs
homelab". Each phase ends with a **demoable** artifact and an explicit **exit criteria**.

### Phase 0 — Repo + infra skeleton (new; ~few days)
*Goal: a `docker compose up` that stands the platform's spine up locally.*
- Restructure to the monorepo layout above; move current app to `apps/web` (keep it running).
- `docker-compose.yml`: Postgres 16 + PostGIS 3.4 (`postgis/postgis` image) + `h3-pg`,
  Adminer/psql for inspection. Pin versions.
- `db/`: **sqitch** project (decision #4) — bootstrap change enabling `postgis`,
  `postgis_topology`, `h3`, with verify + revert scripts. Learn the deploy/verify/revert loop.
- CI-lite: a `make up && sqitch deploy && make smoke` that any phase can extend.
- **Exit:** `docker compose up` gives a PostGIS db with extensions; `sqitch deploy` applies clean
  and `sqitch verify` passes.

### Phase 1 — Foundation: boundaries + current projects in PostGIS, tiles, map
*Spec §6 Phase 1. New tools: Dagster, PostGIS, Martin, MapLibre/PMTiles. Buildable here.*
- **DDL** (`db/`, via sqitch): create `projects`, `project_locations`, `project_funding`
  (spec §3.1) — `geom geometry(Geometry,4326)` and the WKT/`geom_buffered`/`impact_radius_m`
  columns nullable from the first migration (§0a; WKT lands ~June). `project_locations` is a real
  1:N table holding synthesised points today. Reference geos `sa2`, `lga`, `electorate_state`,
  `electorate_fed` (spec §3.3), plus an `rdp_region` table (the POC's real admin unit). GIST
  indexes per spec.
- **Boundaries ingest (Dagster asset group #1):** ABS ASGS 2021 SA2/SA3/SA4/LGA + state/federal
  electorates → PostGIS. Source from ABS (the .shp/.gpkg downloads). RDP polygons from the S3
  geojson the POC already uses. Export each to **PMTiles** (`tippecanoe`) for the basemap.
- **Projects ingest (asset group #2):** port `fetch_projects.py` into Dagster assets that pull
  the **public API live on a schedule** (decision #1) and write to `projects` +
  `project_locations` + `project_funding` instead of GeoJSON. Keep the `(Archived)` strip, funding
  rollup, bp3 multi-location handling, QLD-bbox guard. Ingest already parses WKT → `geom` and
  buffers when present, so the June payload needs no code change.
- **Wire OpenLineage** into Dagster from day one (spec §6 P1) so the lineage graph populates
  as assets land — cheap now, painful to retrofit.
- **Martin**: serve `projects`/`project_locations` and the SA2/RDP layers as MVT straight from
  PostGIS. Add to compose.
- **Frontend**: point `apps/web` at Martin (`MVTLayer`) instead of static GeoJSON for regions +
  pins; keep hover/click → side panel. This is the POC's map, re-sourced from tiles. **Do the
  dark MapLibre restyle here** (decision #6 / spec §5.1) — muted greys, accent-per-portfolio —
  rather than carrying the QGDS-light theme forward.
- **Exit:** map loads SA2 + project pins from live PostGIS-backed tiles in the dark theme;
  hover/click works; the scheduled Dagster job materialises boundaries + projects; lineage shows
  the graph.

### Phase 2 — Modelling, marts, SA2 derivation, `/sa2/[code]`
*Spec §6 Phase 2. New tools: dbt, Soda, Nominatim. Buildable here.*
- **The keystone asset — `project_location_sa2` (spec §3.2):** nightly Dagster asset spatially
  joining `project_locations.geom` against `sa2`. Points give `overlap_fraction` 1.0, but write
  the **real area-overlap math now** and test it against synthetic lines/polygons so the June WKT
  feed allocates funding across multiple SA2s correctly with zero rework. *This* is what makes
  "what's happening in my SA2" possible despite no native SA2.
- **dbt-core** (`transform/`): sources over the raw tables; staging models; tests on every PK
  (spec §6 P2). Build `mart_sa2_summary` (per SA2×FY: project count, funding by source, dominant
  agency) and `mart_project_enriched` (project×package + `array_agg` SA2s touched, funding by
  `overlap_fraction`). Marts honour `package_id` (we set it at ingest) for future history.
- **Soda Core** (`quality/`): null/range/geometry-validity checks wired into Dagster; fail the
  run loud on bad data (spec §6 P2).
- **Address search**: self-hosted Nominatim (compose) → resolve address → containing SA2.
  (The POC already speaks Nominatim for hospital geocoding — reuse the client/UA/backoff.)
- **`apps/api` (FastAPI) stands up here** (decision #5): the `/sa2/[code]` page reads marts
  through FastAPI from day one — no Next.js-route-handler interim. This is also where address
  search → SA2-resolve lives as an endpoint.
- **Frontend `/sa2/[code]`**: SA2 outline + project list + a first context card, fed from marts
  via the FastAPI endpoints above.
- **Exit:** type/say an address → land on its SA2 page with real project list + funding from marts,
  served by FastAPI; dbt tests + Soda checks green in the Dagster run.

### Phase 3 — Context layers + the SA2 page gets rich
*Spec §6 Phase 3. New tools: Observable Plot, multi-source dbt. Buildable here.*
- Ingest as Dagster asset groups, each its own table (spec §3.4), keyed to `sa2_code` where the
  source allows, else own geometry: **Census 2021** (~30 chosen vars), **SEIFA 2021**,
  **ERP** time series, **QPS crime** (LGA×month — joined to SA2 via LGA, note the grain mismatch),
  **schools+catchments**, **hospitals** (already in the POC). LGA-grain sources (crime, rental)
  attach to SA2 through the LGA the SA2 sits in — document the approximation.
- Extend `mart_sa2_summary` with these columns; add `mart_funding_by_sa2_agency_year` and
  `mart_h3_hexbin_r7` (H3 R7 via `h3-pg`) for the statewide hexbin.
- **Home `/`**: statewide `H3HexagonLayer` of $ per hex + portfolio side rail (Observable Plot
  bars). **`/sa2/[code]`**: full context-card set + Plot time series / portfolio donut.
- **Choropleths**: SEIFA/population/canopy as `MVTLayer` styled by joined attribute (toggles
  live on `/atlas`, built next phase, but the choropleth tile sources land here).
- **Exit:** home hexbin renders statewide; SA2 page shows SEIFA/pop/crime/etc. cards from marts.

### Phase 4 — Transit (the showcase)
*Spec §6 Phase 4 + decision-log D (pgRouting, Redpanda+RisingWave for RT). Buildable: static GTFS
+ isochrones here; streaming needs more infra.*
- Ingest **Translink GTFS-static** → `transit_routes` / `transit_stops` (+ shapes for PathLayer).
- **pgRouting** (decision C/B): build the routable graph; compute **30-min isochrones from SA2
  centroids** → `transit_isochrone_30min`. Add a **transit accessibility score** to
  `mart_sa2_summary`.
- Frontend: subtle transit `PathLayer` behind projects; per-SA2 isochrone toggle.
- **Stretch (Path-B-ish infra):** GTFS-realtime → Redpanda → RisingWave → animated `TripsLayer`
  of live buses. Defer unless the homelab has the streaming stack.
- **Exit:** isochrone toggle + accessibility score on SA2 pages; transit network draws.

### Phase 5 — Risk & environment + 3D
*Spec §6 Phase 5. Buildable here (raster only if canopy is raster).*
- Ingest flood extents, QFES bushfire history, tree canopy (TiTiler+COG only **if** canopy is
  raster — spec §2; otherwise SA2 indicator). Exposure metrics into `mart_sa2_summary`
  (% of SA2 in Q100 flood, etc.).
- `/atlas` risk-overlay toggles (translucent `PolygonLayer`).
- **3D mode**: `PolygonLayer` extruded by spend. With points-only project data, extrude the
  **SA2 choropleth** by a metric (funding/pop). Once the June WKT feed brings real project
  polygons, this layer can additionally extrude those by spend per spec §5.2.
- **Exit:** risk toggles work; 3D extrusion mode renders an SA2 metric.

### Phase 6 — Lakehouse mirror
*Spec §6 Phase 6. New tools: GeoParquet, DuckDB spatial, H3, MinIO. Buildable; MinIO local in compose.*
- Nightly Dagster asset: export PostGIS tables → **GeoParquet on MinIO**.
- **FastAPI** (`apps/api`) backed by **DuckDB** (spatial ext) for ad-hoc analytical queries over
  the Parquet — the read path for heavy queries the frontend shouldn't hit Postgres for.
- **H3 benchmark** (the explicit learning goal): same aggregation in PostGIS vs DuckDB+H3, timed.
- **Exit:** a DuckDB-backed `/api` endpoint answers an analytical query off MinIO Parquet; H3
  timing write-up in the README.

### Phase 7 — Polish + production on the homelab
*Spec §6 Phase 7. Mostly homelab-validated.*
- **Refine the dark MapLibre style** in Maputnik (the dark restyle itself landed in Phase 1 per
  decision #6 — this is polish: fine-tune the accent palette, label hierarchy, zoom transitions).
- deck.gl filter-change transitions; `/compare` page (up to 4 SA2s).
- **Authentik forward-auth via Traefik** for all four routes (spec §8); Martin via token if
  forward-auth is painful for the tile fetches.
- **Marquez** lineage UI at `/_meta/lineage`; README + screenshots.
- **Exit:** atlas.porterble.com behind Authentik, dark theme, compare page, lineage exposed.

---

## 4. Open questions (spec §7), answered where the POC already knows

| # | Spec question | Status from verified public data |
|---|---|---|
| 1 | Canonical description | **Moot (Path A):** public API has one `description`. Re-opens only under Path B |
| 2 | Geometry presence | **Answered for now:** point-level lat/long only today; many projects have *no* coords (only 640/1085 on `/api/projects`). `geom` is **nullable** and typed `Geometry` (not `Point`) so future WKT lines/polygons need no remodel; ingest validation = bbox guard now, WKT parse path ready (§0a) |
| 3 | `impactRadius` semantics | **Not present yet; column kept nullable** (§0a). When populated, treated as metres and buffered via `ST_Buffer(geom::geography, impact_radius_m)`. Confirm units if/when a real value appears |
| 4 | `package.versionNumber` | **Deferred (decision #2):** not surfaced publicly; multi-version + history parked as a future enhancement. We still mint `package_id`/`financial_year` at ingest so it's there when history work begins |
| 5 | `status`/`entryState` enums | **Answered (partial):** public package exposes only `status = 2`; can't distinguish live/withdrawn from public data |
| 6 | `excluded` on locations | **Open / Path B:** no `locations`/`excluded` flag publicly; n/a until internal access |
| 7 | `fromBP3` | **Reframed:** bp3 is a *separate endpoint* (`/api/bp3projects`) we already merge as `category="capital"`, not a boolean. Keep the category split |
| 8 | `pinGroup` | **Open / Path B:** not present publicly |
| 9 | API access from outside Treasury | **Resolved (decision #1):** the API is **public** → Dagster pulls it live on a schedule. No manual-dump workflow |
| 10 | Historical packages | **Resolved (decision #2):** history is a **future enhancement**, out of initial scope. When picked up, it comes from `data.qld.gov.au` per-year dumps (public API is current-year only), not `package_id` calls |

---

## 5. Risks & sequencing notes

- **Data drives the wow-factor, and it's partly en route.** Lines/polygons + 3D project extrusion
  arrive with the ~June WKT feed (decision #3) — built dormant now, light up then. Status filtering
  and multi-version history stay parked (only `status=2` public; history deferred per decision #2).
  Build WKT-shaped from day one so June is a data event, not a migration.
- **SA2 is derived, full stop.** The whole "my SA2" framing rests on `project_location_sa2`
  (Phase 2). Until that join exists, RDP regions (Phase 1, already in the POC) are the unit.
- **Don't rewrite the POC ingest — port it.** `fetch_projects.py` is the tested source of truth
  for the public API's quirks; Phase 1 moves it into Dagster, it doesn't reinvent it.
- **Keep it runnable every phase.** The POC already runs; never let a refactor leave `main`
  un-demoable. Restructure (Phase 0) behind a working app.
- **Validate infra on the homelab, not here.** Auth/Traefik/MinIO/DNS get configured in-repo but
  proven on porterble.com. Budget Phase 7 time for that round-trip.
- **Learning-first ordering is deliberate:** each phase introduces 1–2 tools (Dagster+PostGIS+
  Martin → dbt+Soda → Plot → pgRouting → 3D → DuckDB+H3+MinIO → Maputnik+Authentik) so none is a
  big-bang.
