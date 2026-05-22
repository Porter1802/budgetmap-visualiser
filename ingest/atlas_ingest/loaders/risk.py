"""Risk & environment loaders (spec §3.4): flood, bushfire, tree canopy.

Flood/bushfire are free-form polygon layers (own geometry); canopy is an SA2
indicator. Polygon loaders accept a GeoJSON FeatureCollection (URL or path).
"""
from __future__ import annotations

import csv
import json

from ..db import connect
from .sources import fetch_json


def _load_polygons(source: str, table: str, prop_cols: dict[str, str]) -> int:
    fc = fetch_json(source)
    cols = list(prop_cols)
    placeholders = ", ".join(["%s"] * len(cols))
    rows = 0
    with connect() as conn, conn.cursor() as cur:
        cur.execute(f"TRUNCATE {table} RESTART IDENTITY")
        for f in fc["features"]:
            props = f["properties"]
            vals = [props.get(prop_cols[c]) for c in cols]
            cur.execute(
                f"INSERT INTO {table} ({', '.join(cols)}, geom) "
                f"VALUES ({placeholders}, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))",
                (*vals, json.dumps(f["geometry"])),
            )
            rows += 1
    return rows


def load_flood(source: str) -> int:
    return _load_polygons(source, "flood_extents", {"source": "source", "scenario": "scenario"})


def load_bushfire(source: str) -> int:
    return _load_polygons(source, "bushfire_history", {"year": "year", "source": "source"})


def load_canopy_csv(path: str) -> int:
    """CSV columns: sa2_code, canopy_pct, year."""
    rows = 0
    with connect() as conn, conn.cursor() as cur, open(path, newline="") as fh:
        cur.execute("TRUNCATE tree_canopy_sa2")
        for r in csv.DictReader(fh):
            cur.execute(
                "INSERT INTO tree_canopy_sa2 (sa2_code, canopy_pct, year) VALUES (%s, %s, %s) "
                "ON CONFLICT (sa2_code) DO UPDATE SET canopy_pct = EXCLUDED.canopy_pct",
                (r["sa2_code"], r.get("canopy_pct") or None, r.get("year") or None),
            )
            rows += 1
    return rows
