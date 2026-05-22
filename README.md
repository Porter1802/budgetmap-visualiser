# QLD Budget Map — POC (v0.3)

The prettiest map of Queensland capital projects we can show on a laptop, built
to look like it belongs to qld.gov.au. Public API → static files → a
QGDS-aligned MapLibre + deck.gl map. No database, no backend.

## Run it

```bash
# 1. Pull data (writes public/data/projects.geojson + meta.json + regions.geojson)
python3 scripts/fetch_projects.py

# 2. Install + dev
npm install
npm run dev          # http://localhost:3000

# 3. Static build (writes ./out)
npm run build
```

## Deploy (Docker / Portainer)

The app is a fully static export served by nginx.

```bash
docker compose up -d --build   # serves on :8080
```

In Portainer: **Stacks → Add stack**, point it at this repo's
`docker-compose.yml` (or paste it). The committed `public/data/*` is baked into
the image at build time; re-run the ingest script and rebuild to refresh.

## What the public API actually returns

The spec assumed the internal Databricks schema. The public payload differs —
the ingest script (`scripts/fetch_projects.py`) is written against reality:

| Spec assumption | Reality (verified 2026-05) |
|---|---|
| Top-level array | Confirmed (1085 projects, no `{data:…}` envelope) |
| `locations[]` with WKT geometry | No `locations`, no WKT anywhere. Geometry is project-level `latitude`/`longitude` only |
| Points, lines, polygons | Points only (640 of 1085 have coords, all in the QLD bbox) |
| `impactRadius` | Not present — impact rings dropped |
| `projectFunding.totalQldFunding` (camelCase) | Confirmed; 690 projects funded, up to $9b |
| `agency.name`, `type.name` | Both present (28 mapped agencies — all carry an "(Archived)" suffix we strip; 4 types) |
| `status` string | Integer; the published package exposes only `2`. Status meta is inferred |
| `webLink` populated | Always empty — footer link falls back to the official site |
| CORS `*` | No `Access-Control-Allow-Origin` → static-file approach is correct |

Region context comes from two extra sources, also bundled to static files:
the RDP region polygons (`budgetmapprodstorage.s3…/prod/data/RDP.geojson`,
joined by `RDP_code`) and region metadata (`/api/regions`). Each project's
`regions[].code` links it to the polygons, which drives the region filter.

## Stack

- **Next.js 15** (App Router, static export) + **Tailwind**
- **MapLibre GL** basemap — custom QGDS-palette style (`public/style/qgds-light.json`)
  recolouring Carto's free OpenMapTiles vector tiles
- **deck.gl** (`MapboxOverlay`, interleaved) — `GeoJsonLayer` for the blue
  region polygons, `ScatterplotLayer` for fixed-size pins, `TextLayer` for the
  count badge on coincident pins
- **Observable Plot** — funding breakdown bar, themed to blue tints
- **Noto Sans + IBM Plex Mono**, self-hosted via `next/font`

## Design

One source of truth for the palette: `src/lib/tokens.ts` (canvas RGB) mirrored
by CSS `color-mix(in oklch, …)` for DOM surfaces. QGDS ships a single brand
blue; every tint/shade is that blue mixed with white or near-black. The map is
a single blue view: translucent region polygons under fixed-size project pins.
A region filter (top-centre, fed by the regions API) narrows the pins to the
selected RDP region(s), highlights that region's outline, and fades the rest.
