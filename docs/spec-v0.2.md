# QLD Capital Investment Atlas — v0.2 Spec

Personal learning project. Internal-only, self-hosted on porterble.com homelab behind Authentik. Factual, exploratory, “what’s happening where I live” framing. SA2 as the primary analytical unit.

## 1. Goals

**Primary:** Learn the modern geospatial data stack end-to-end against a domain I already understand.

**Secondary:** Build something genuinely useful — a place to ask “what capital investment is happening in/near my SA2, how does that compare across the state, and what does the surrounding context (demographics, risk, access, services) look like?”

**Non-goals:** Public hosting. Editorial conclusions. Political commentary. Real-time anything except transit.

## 2. Tech stack

Picked to maximise breadth of learning while keeping aesthetic ceiling high.

|Layer           |Tool                              |Why                                                             |
|----------------|----------------------------------|----------------------------------------------------------------|
|Canonical store |Postgres 16 + PostGIS 3.4         |Handles all WKT types natively, mature, you already run Postgres|
|Lakehouse mirror|GeoParquet on MinIO               |Learn open table formats, query with DuckDB                     |
|Analytics engine|DuckDB + spatial ext              |Single-node beast, GeoParquet native                           |
|Spatial indexing|H3 (`h3-pg`, `h3-py`)             |Hex aggregation, fast cross-dataset joins                       |
|Transformation  |dbt-core (Postgres adapter)       |Industry standard, you’ve sidestepped it so far                 |
|Orchestration   |Dagster                           |Asset-based, modern; learn it instead of Airflow                |
|Tile serving    |Martin (vector) + PMTiles (static)|PostGIS → MVT directly; PMTiles for boundaries                  |
|Raster          |TiTiler + COG                     |If/when satellite or canopy rasters get added                   |
|API             |FastAPI                           |Search, ad-hoc queries, isochrones                              |
|Frontend        |Next.js 15 + MapLibre GL + deck.gl|Aesthetic ceiling; deck.gl for the wow factor                   |
|Basemap style   |Custom MapLibre style (Maputnik)  |Don’t ship default OSM                                          |
|Charts/panels   |Observable Plot or Recharts       |Plot for narrative, Recharts for dashboard cards                |
|Address search  |Pelias (self-hosted) or Nominatim |Self-hosted geocoding for the “find my SA2” entry point         |
|Data quality    |Soda Core                         |Wire into Dagster, fail loud on bad data                        |
|Lineage         |OpenLineage → Marquez             |Auto-populated lineage graphs from Dagster                      |
|Auth            |Authentik forward-auth via Traefik|Already running                                                 |

## 3. Data model

Schema-driven (v0.2). The API returns one struct per project. Key facts that shape the model:

- **One project → many locations** (`locations: array<struct<…>>`). Split 1:N.
- **Geometry lives on locations**, not projects. Each location has `geometry` (WKT), `geometryGeoJSON`, `geometryType`, lat/long, and optional `impactRadius` (buffer for point projects).
- **Native region tags are SA4 / SED / LGA**, not SA2. SA2 is derived via spatial join after ingest.
- **Packages = annual snapshots** (`package.financialYear` + `versionNumber`). Historical depth = older packages.
- **Funding splits 5 ways** — QLD / Fed / Local / Own-source / Private — each with annual and total. Separate fact.
- **Four description fields** — pick canonical at ingest, keep the rest in raw JSON.
- **Editorial workflow fields** (`publishReady`, `qaNotes`, `lockedAt`, `updatedBy`, etc.) — store in audit table or drop.

### 3.1 Canonical entities

**Project (one row per project per package):**

```sql
projects (
  project_id           int not null,
  package_id           int not null,
  financial_year       text not null,                -- '2024-25'
  package_version      int not null,
  primary key (project_id, package_id),

  name                 text,
  description          text,                         -- canonical (chosen at ingest)
  description_raw      jsonb,                        -- all 4 description variants
  activity_word        text,                         -- 'Construct', 'Upgrade', ...

  agency_id            int,
  agency_name          text,
  type_id              int,
  type_name            text,                         -- project category (icon on map)

  in_qld_program       boolean,
  in_fed_program       boolean,
  qld_program_name     text,
  fed_program_name     text,

  is_commitment        boolean,
  is_new_initiative    boolean,
  from_bp3             boolean,
  budget_outcome       boolean,
  budget_highlight     boolean,
  status               int,
  entry_state          int,

  pin_latitude         float,                        -- project-level pin
  pin_longitude        float,
  pin_geom             geometry(Point, 4326),        -- materialised from lat/long

  region_sa4           text,
  region_lga           text,
  region_lga_code      text,
  region_sed           text,
  region_sed_code      text,

  raw                  jsonb,                        -- full source payload
  ingested_at          timestamptz default now()
);

create index on projects (package_id);
create index on projects (financial_year);
create index on projects (agency_id);
create index on projects using gist (pin_geom);
```

**Locations (1:N from project):**

```sql
project_locations (
  location_id          int primary key,
  project_id           int not null,
  package_id           int not null,
  foreign key (project_id, package_id) references projects,

  address              text,
  latitude             float,
  longitude            float,
  geometry_wkt         text,                         -- raw WKT from API
  geometry_geojson     text,                         -- raw GeoJSON from API
  geometry_type        text,                         -- Point | LineString | Polygon | ...
  impact_radius_m      float,

  geom                 geometry(Geometry, 4326),     -- parsed from WKT
  geom_buffered        geometry(Polygon, 4326),      -- st_buffer(geom::geography, impact_radius_m) when set

  region_sa4           text,
  region_sed           text,
  region_sed_code      int,
  region_rdp           text,
  region_lga           text,
  region_lga_code      int,

  excluded             boolean,
  dnrm_reference       text
);

create index on project_locations using gist (geom);
create index on project_locations using gist (geom_buffered);
create index on project_locations (project_id, package_id);
```

**Funding (one row per project per source):**

```sql
project_funding (
  project_id           int,
  package_id           int,
  funding_source       text,                         -- qld | fed | local | own_src | private
  annual_amount_aud    bigint,
  total_amount_aud     bigint,
  primary key (project_id, package_id, funding_source),
  foreign key (project_id, package_id) references projects
);
```

### 3.2 Derived spatial joins

A nightly Dagster asset spatially joins `project_locations.geom` (or `geom_buffered` where present) against the ABS SA2 layer:

```sql
project_location_sa2 (
  location_id          int references project_locations,
  sa2_code             text references sa2,
  overlap_fraction     numeric,                      -- for lines/polygons spanning multiple SA2s
  primary key (location_id, sa2_code)
);
```

This is the table that powers “what’s happening in my SA2” — sum funding × overlap fraction across locations for honest allocation of multi-SA2 projects.

### 3.3 Reference geographies

```sql
sa2 (
  sa2_code            text primary key,
  sa2_name            text,
  sa3_code            text,
  sa4_code            text,
  gccsa_code          text,
  state_code          text,
  area_km2            numeric,
  geom                geometry(MultiPolygon, 4326)
);

lga (
  lga_code            text primary key,
  lga_name            text,
  geom                geometry(MultiPolygon, 4326)
);

electorate_state (...);  -- QLD state seats
electorate_fed (...);    -- federal divisions
```

### 3.4 Context layers

One table per dataset, all keyed (where possible) to `sa2_code` for analytical joins. Free-form ones keep their own geometry.

|Table                    |Grain                        |Source           |Geo type       |
|-------------------------|-----------------------------|-----------------|---------------|
|`seifa`                  |SA2                          |ABS              |indicator only |
|`population_erp`         |SA2 × year                   |ABS ERP          |indicator only |
|`census_2021`            |SA2                          |ABS Census       |many columns   |
|`crime_offences`         |LGA × month × offence        |QPS Open Data    |indicator only |
|`flood_extents`          |polygon                      |BCC + state      |polygon        |
|`bushfire_history`       |polygon × year               |QFES / state     |polygon        |
|`transit_routes`         |line                         |Translink GTFS   |line           |
|`transit_stops`          |point                        |Translink GTFS   |point          |
|`transit_isochrone_30min`|polygon per stop/SA2 centroid|computed         |polygon        |
|`schools`                |point + catchment            |Dept of Education|point + polygon|
|`hospitals`              |point                        |QH open data     |point          |
|`tree_canopy_sa2`        |SA2                          |state LiDAR      |indicator only |
|`rental_bonds`           |LGA × quarter                |RTA open data    |indicator only |

### 3.5 Derived marts

dbt builds these for the frontend. All marts honour `package_id` so historical comparisons are exact.

- `mart_sa2_summary` — one row per SA2 × FY: population, SEIFA, project count, total funding by source, dominant agency/portfolio, crime rate, transit accessibility score, flood/bushfire exposure %, canopy %.
- `mart_project_enriched` — one row per project × package, joined to `project_location_sa2` (so `array_agg` of SA2s touched + funding allocated by `overlap_fraction`).
- `mart_funding_by_sa2_agency_year` — funding rolled up by SA2 × agency × FY × funding source.
- `mart_h3_hexbin_r7` — H3 R7 aggregation of project counts and dollars for fast statewide hexbin viz.
- `mart_project_history` — same `project_id` across packages, year-on-year delta in funding/status/scope. The “what changed” view.

## 4. Datasets — what to ingest

In priority order. Each becomes a Dagster asset group.

1. **ABS ASGS 2021 boundaries** — SA2, SA3, SA4, LGA, state electorates, federal divisions. PMTiles export for the basemap.
2. **QLD capital projects (current year)** — your primary fact, from open data.
3. **QLD capital projects (historical)** — same source, all available years.
4. **ABS Census 2021 by SA2** — subset to ~30 variables that matter for the framing.
5. **ABS ERP by SA2 (annual time series)** — population growth context.
6. **SEIFA 2021 by SA2** — disadvantage overlay.
7. **Translink GTFS (static)** — routes, stops, calendar. Build a graph for isochrones.
8. **Translink GTFS-realtime** — live vehicle positions (Phase 3 indulgence).
9. **QPS crime by LGA × month** — community safety context.
10. **State flood study layers** — exposure overlay.
11. **QFES bushfire history** — exposure overlay.
12. **Dept of Education schools + catchments** — service context.
13. **QH hospitals** — service context.
14. **RTA rental bond medians** — housing affordability context.
15. **Tree canopy by SA2** — environment context.

## 5. Visualisation approach

### 5.1 The “feel”

Dark theme by default (capital city budget map dark mode is rare and looks expensive). Custom MapLibre style: muted greys for context, accent colours per portfolio, deliberately limited palette. No emoji, no rounded-everything, no shadcn default-looking cards. Closer to Felt / Foursquare Atlas / Mapbox demo aesthetic than to Power BI.

### 5.2 Layer-by-layer viz choices

|Layer                                 |deck.gl layer                                 |Notes                                      |
|--------------------------------------|----------------------------------------------|-------------------------------------------|
|SA2 boundaries                        |`MVTLayer` from Martin                        |Hover highlight, click → side panel        |
|Project points                        |`ScatterplotLayer` + `IconLayer` per portfolio|Size = log(spend), colour = portfolio      |
|Project lines (roads)                 |`PathLayer`                                   |Width = log(spend)                         |
|Project polygons                      |`PolygonLayer`                                |Extruded by spend in 3D mode toggle        |
|Statewide project density             |`H3HexagonLayer` at R7                        |Aggregate $ per hex, smooth zoom transition|
|Choropleth (SEIFA, population, canopy)|`MVTLayer` styled by joined attribute         |Diverging palette                          |
|Transit network                       |`PathLayer` from GTFS shapes                  |Subtle, behind projects                    |
|Transit isochrones                    |`PolygonLayer` translucent                    |Toggle per SA2                             |
|Flood/bushfire                        |`PolygonLayer` translucent                    |Risk overlay toggle                        |
|Live buses (Phase 3)                  |`TripsLayer` animated                         |The hypnotic demo piece                    |

### 5.3 Page layout

- **Home (`/`)**: statewide hexbin of capital investment. Filters: portfolio, year, status. Side rail with portfolio totals as Observable Plot bars.
- **My SA2 (`/sa2/[code]`)**: enter address → resolve to SA2 → page with: SA2 outline map, project list, context cards (SEIFA, pop growth, crime rate, transit access score, flood/bushfire exposure, canopy %), portfolio donut, year-over-year spend line.
- **Compare (`/compare`)**: pick up to 4 SA2s, side-by-side cards + small-multiple maps.
- **Project (`/project/[id]`)**: project detail, geometry on map, SA2 context, similar projects.
- **Atlas (`/atlas`)**: free-form exploration — toggle any layer, any choropleth, any filter.

## 6. Build phases

Two-week phases, designed so each ships something demoable and introduces 1–2 new tools.

### Phase 1 — Foundation

- Postgres + PostGIS on homelab VM
- Dagster project skeleton, OpenLineage wired in
- Ingest ABS ASGS (SA2, LGA, electorates) → PostGIS + PMTiles export
- Ingest current-year capital projects → `projects` table
- Martin serving SA2 tiles + projects tiles
- Minimal Next.js + MapLibre app: SA2 boundaries + project pins, hover/click
- **New tools learned:** Dagster, PostGIS, Martin, MapLibre, PMTiles

### Phase 2 — Modelling & marts

- dbt-core project against Postgres
- Sources, staging, marts. Tests on every primary key.
- Soda checks for nullness, ranges, geometry validity
- Build `mart_sa2_summary` and `mart_project_enriched`
- Add `/sa2/[code]` page with side panel pulling from marts
- Address search via self-hosted Nominatim → SA2 resolve
- **New tools learned:** dbt, Soda, Nominatim

### Phase 3 — Context layers

- Census 2021, SEIFA, ERP, crime, schools, hospitals
- Choropleth toggles on `/atlas` page
- Context cards on `/sa2/[code]` page
- Observable Plot for the time series + portfolio breakdowns
- **New tools learned:** Observable Plot, multi-source dbt modelling

### Phase 4 — Transit (the showcase)

- Ingest GTFS-static, build routes/stops tables
- Compute 30-min transit isochrones from SA2 centroids using Valhalla or pgRouting
- Add transit accessibility score to `mart_sa2_summary`
- Add transit network layer + isochrone toggle
- Stretch: GTFS-realtime → Redpanda → live `TripsLayer` of every bus
- **New tools learned:** GTFS, isochrones, optionally streaming

### Phase 5 — Risk & environment

- Flood extents, bushfire history, tree canopy
- Exposure metrics in `mart_sa2_summary` (% of SA2 in Q100 flood, etc.)
- Risk overlay toggle on `/atlas`
- Add 3D extrusion mode (PolygonLayer extruded by spend, terrain underneath)
- **New tools learned:** raster handling (if canopy is raster), 3D viz

### Phase 6 — Lakehouse mirror

- Export PostGIS tables to GeoParquet on MinIO nightly via Dagster
- FastAPI endpoint backed by DuckDB for ad-hoc analytical queries
- H3 indexing experiments — same dataset, same query, time it in PostGIS vs DuckDB+H3
- **New tools learned:** GeoParquet, DuckDB spatial, H3, MinIO as object store

### Phase 7 — Polish

- Custom MapLibre style in Maputnik (dark mode, muted, accent palette)
- Animations on filter changes (deck.gl transitions)
- `/compare` page
- Auth via Authentik forward-auth
- Marquez lineage UI exposed at `/_meta/lineage`
- README + screenshots
- **New tools learned:** Maputnik, motion design for data viz

## 7. Open questions — post-schema

Schema-aware (v0.2). All schema-blind questions resolved.

1. **Canonical description** — pick one of `description` / `overideDescription` / `qaDescription` / `trDescription`. Guess: `qaDescription` is the published one, `description` is the source, `overideDescription` is editorial override, `trDescription` is translated/short-form. Confirm which is canonical for analytics.
2. **Geometry presence** — does every location have a populated `geometry` WKT, or do some only have lat/long with `geometryType = 'Point'`? Affects ingest validation and whether `geom` can be NOT NULL.
3. **`impactRadius` semantics** — metres? Only set when geometry is a single point? Confirm units and when it’s populated.
4. **`package.versionNumber`** — can the same FY have multiple versions (budget + MYFER)? If so, which is canonical for analytics — latest only, or both with version filter?
5. **`status` and `entryState` enums** — what are the values? Need this to filter live vs withdrawn/excluded.
6. **`excluded: boolean` on locations** — filter at ingest, or keep with a flag?
7. **`fromBP3`** — does this mean “originated in BP3” (operating measures with capital component)? Useful filter or noise?
8. **`pinGroup`** — map clustering hint, or something analytical?
9. **API access from outside Treasury** — can Dagster pull live from outside the network, or is this a manual JSON dump workflow? Affects ingest cadence and the value of the orchestration layer.
10. **Historical packages availability** — all callable via the same API by `package_id`, or do older years need to come from data.qld.gov.au separately?

## 8. Deployment

- All services as Docker Compose on existing Proxmox VM (or split: Postgres on its own VM, services on Docker host).
- Traefik routes:
  - `atlas.porterble.com` → Next.js (Authentik forward-auth)
  - `atlas-api.porterble.com` → FastAPI (Authentik forward-auth)
  - `atlas-tiles.porterble.com` → Martin (Authentik or token, whichever is less painful for the frontend)
  - `atlas-lineage.porterble.com` → Marquez (Authentik forward-auth)
- Backups via existing Proxmox Backup Server.
- Logs into Loki once you have that running.

## 9. Stretch / “if I get carried away”

- **Time animation** — deck.gl `TripsLayer` but for project status over time across the state.
- **Story mode** — Observable Framework microsite embedded at `/stories` with scrollytelling pieces (“how Brisbane’s northside got its transport investment”).
- **Natural language queries** — LLM-to-SQL over the dbt marts via FastAPI. Bounded, read-only role, allowlisted tables.
- **PMTiles export of everything** — so the whole atlas could in theory run offline / from object storage with no live DB.
- **3D buildings** — combine OSM buildings + project extrusions for a Cesium-or-deck.gl-3D mode.

---

## Decisions log

Resolved:

- ✅ **A**: Schema received (capital projects API). Multi-location, multi-funding-source confirmed. Data model in §3 updated. Still want one full sample project JSON to lock down WKT format details before Phase 1.
- ✅ **B**: pgRouting for isochrones (Valhalla skipped — fewer moving parts).
- ✅ **C**: Nominatim for geocoding (default).
- ✅ **D**: GTFS-realtime in Phase 4 — Redpanda + RisingWave in scope.

Open:

- The 10 schema-specific questions in §7.
