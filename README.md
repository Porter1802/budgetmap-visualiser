# QLD Capital Investment Atlas

Internal, self-hosted atlas of Queensland capital investment with the
surrounding context (demographics, risk, access, services), built primarily to
learn the modern geospatial data stack. SA2 is the primary analytical unit.

> **Status:** migrating from the static v0.3 POC to the full platform described
> in [`docs/spec-v0.2.md`](docs/spec-v0.2.md). The build is sequenced in
> [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## Layout (monorepo)

```
apps/web/      Next.js 15 + MapLibre + deck.gl frontend (the POC lives here)
apps/api/      FastAPI (mart reads, search, ad-hoc DuckDB queries)
ingest/        Dagster project — ingest assets, OpenLineage
transform/     dbt-core project — staging models + marts
db/            PostGIS schema as sqitch migrations
quality/       Soda Core data-quality checks
tiles/         Martin config + PMTiles export
infra/         compose overrides, Traefik labels, Authentik notes
docs/          spec + implementation plan
```

## Quick start (local, existing Postgres)

```bash
cp .env.example .env          # adjust connection if needed
make migrate                  # sqitch deploy: PostGIS schema
make verify                   # sqitch verify
make ingest                   # pull public API -> projects/locations/funding
make dbt                      # build marts
make web-dev                  # http://localhost:3000
```

`make migrate`/`verify`/`ingest`/`dbt` need PostgreSQL 16 + PostGIS 3.4 with the
`pgrouting`, `h3`, and `h3_postgis` extensions. Locally that's an apt-installed
server; on the homelab it's the `db` service in `docker-compose.yml`.

## Full stack (homelab)

```bash
make up                                   # core: db + martin + api + web
docker compose --profile analytics up -d  # + dagster
docker compose --profile lakehouse up -d  # + minio
docker compose --profile lineage up -d    # + marquez
```

Behind Traefik forward-auth (Authentik) on porterble.com — see `infra/`.

## Data reality

The v0.2 spec assumed the internal Treasury schema; the public API is thinner
(points only today, no WKT, RDP/SA4/SED/LGA not SA2). The schema is built
*WKT-shaped* anyway because lines/polygons are expected in `/api/projects`
around June 2026 — see the reconciliation table in the implementation plan. SA2
is derived from `project_locations.geom` via the spatial join in
`db/deploy/0004-derived-spatial.sql`.

## Stack

Postgres 16 + PostGIS 3.4 · pgRouting · H3 · Dagster · dbt-core · Soda Core ·
Martin + PMTiles · DuckDB + GeoParquet on MinIO · FastAPI · Next.js 15 +
MapLibre GL + deck.gl · Observable Plot · Nominatim · OpenLineage → Marquez ·
Authentik forward-auth via Traefik.
