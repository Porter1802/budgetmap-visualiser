# QLD Budget Map — POC (v0.3)

The prettiest map of Queensland capital projects we can show on a laptop, built
to look like it belongs to qld.gov.au. Public API → static files → a
QGDS-aligned MapLibre + deck.gl map. No database, no backend.

## Run it

```bash
# 1. Pull data (writes public/data/projects.geojson + meta.json)
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

Because the data is points-only, the line/polygon deck.gl layers exist for
forward-compatibility but render nothing today.

## Stack

- **Next.js 15** (App Router, static export) + **Tailwind**
- **MapLibre GL** basemap — custom QGDS-palette style (`public/style/qgds-light.json`)
  recolouring Carto's free OpenMapTiles vector tiles
- **deck.gl** (`MapboxOverlay`, interleaved) — Scatterplot for points, hexbin
  via `PolygonLayer` + h3-js (avoids the heavy `@deck.gl/geo-layers` chain)
- **Observable Plot** — funding breakdown bar, themed to blue tints
- **Noto Sans + IBM Plex Mono**, self-hosted via `next/font`

## Design

One source of truth for the palette: `src/lib/tokens.ts` (canvas RGB) mirrored
by CSS `color-mix(in oklch, …)` for DOM surfaces. QGDS ships a single brand
blue; every tint/shade is that blue mixed with white or near-black. Maroon and
error-red are excluded as decorative colours. Three modes: **Blue** (single
hue), **By agency** (controlled on-brand buckets), **Heatmap** (H3 hexbin, blue
sequential ramp, 3D extrusion by funding).
