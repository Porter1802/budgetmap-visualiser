# Deployment (homelab)

The Atlas runs as Docker Compose stacks on the existing Proxmox VM, behind
Traefik with Authentik forward-auth. Services validated locally against an
apt-installed PostGIS in this repo's CI; auth/routing is proven here on the VM.

## Routes (spec §8)

| Host | Service | Auth |
|------|---------|------|
| `atlas.porterble.com` | Next.js (`web`) | Authentik forward-auth |
| `atlas-api.porterble.com` | FastAPI (`api`) | Authentik forward-auth |
| `atlas-tiles.porterble.com` | Martin (`martin`) | token (forward-auth too chatty for tiles) |
| `atlas-lineage.porterble.com` | Marquez (`marquez`) | Authentik forward-auth |

`traefik-dynamic.yml` defines the forward-auth middleware and the four routers.
Point Traefik's file provider at it. For the full step-by-step (Authentik
provider/application/outpost + the Traefik wiring), see
[`AUTHENTIK_TRAEFIK.md`](AUTHENTIK_TRAEFIK.md). The Atlas stack runs **none** of
its own Authentik/Traefik — these are integration notes for the existing ones.

## Bring-up

```bash
cp ../.env.example ../.env            # set real secrets
make -C .. up                          # core: db + martin + api + web
docker compose --profile analytics up -d   # dagster (+ OpenLineage -> marquez)
docker compose --profile lineage   up -d   # marquez UI
docker compose --profile lakehouse up -d   # minio
docker compose --profile geocode   up -d   # nominatim (large OSM import)
```

## Lineage

Dagster emits OpenLineage events when `OPENLINEAGE_URL` points at Marquez; the
graph is browsable at `atlas-lineage.porterble.com` (proxy of Marquez, exposed
in-app at `/_meta/lineage`).

## Backups & logs

PostGIS volume + MinIO bucket via the existing Proxmox Backup Server. Container
logs ship to Loki once that's running.
