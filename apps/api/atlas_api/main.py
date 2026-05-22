"""FastAPI app: mart reads, address search -> SA2 resolve, hexbin GeoJSON.

Reads the dbt marts (schema `marts`) and the canonical geos (schema `public`).
Address search proxies Nominatim then resolves the point to its containing SA2
via PostGIS — the entry point for the "find my SA2" flow.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .db import pool, query, query_one

NOMINATIM_URL = os.environ.get("NOMINATIM_URL", "https://nominatim.openstreetmap.org/search")
NOMINATIM_UA = os.environ.get("NOMINATIM_UA", "qld-atlas/0.4 (contact jake1802@gmail.com)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    try:
        yield
    finally:
        pool.close()


app = FastAPI(title="QLD Capital Investment Atlas API", version="0.4.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    row = query_one("select count(*) as n from projects")
    return {"status": "ok", "projects": row["n"] if row else 0}


@app.get("/sa2/{sa2_code}")
def sa2_detail(sa2_code: str) -> dict:
    summary = query_one(
        "select * from marts.mart_sa2_summary where sa2_code = %s", (sa2_code,)
    )
    if summary is None:
        raise HTTPException(404, f"SA2 {sa2_code} not found")
    return summary


@app.get("/sa2/{sa2_code}/projects")
def sa2_projects(sa2_code: str, limit: int = Query(200, le=1000)) -> list[dict]:
    return query(
        """
        select project_id, name, agency_name, type_name, category,
               total_funding_aud, status
        from marts.mart_project_enriched
        where %s = any(sa2_codes)
        order by total_funding_aud desc
        limit %s
        """,
        (sa2_code, limit),
    )


@app.get("/project/{project_id}")
def project_detail(project_id: int) -> dict:
    row = query_one(
        "select * from marts.mart_project_enriched where project_id = %s order by package_id desc limit 1",
        (project_id,),
    )
    if row is None:
        raise HTTPException(404, f"Project {project_id} not found")
    return row


@app.get("/hexbin")
def hexbin() -> dict:
    rows = query(
        """
        select h3_index, project_count, total_funding_aud,
               st_asgeojson(geom)::json as geometry
        from marts.mart_h3_hexbin_r7
        """
    )
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": r.pop("geometry"),
                "properties": r,
            }
            for r in rows
        ],
    }


@app.get("/search")
async def search(q: str = Query(..., min_length=3)) -> dict:
    """Geocode an address (Nominatim) and resolve it to its containing SA2."""
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(
            NOMINATIM_URL,
            params={"q": q, "format": "json", "limit": 1, "countrycodes": "au"},
            headers={"User-Agent": NOMINATIM_UA},
        )
        resp.raise_for_status()
        hits = resp.json()
    if not hits:
        raise HTTPException(404, "Address not found")
    lon, lat = float(hits[0]["lon"]), float(hits[0]["lat"])
    sa2 = query_one(
        """
        select sa2_code, sa2_name
        from sa2
        where st_contains(geom, st_setsrid(st_makepoint(%s, %s), 4326))
        limit 1
        """,
        (lon, lat),
    )
    return {
        "query": q,
        "lon": lon,
        "lat": lat,
        "display_name": hits[0].get("display_name"),
        "sa2": sa2,
    }
