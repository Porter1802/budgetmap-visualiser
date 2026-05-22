"""Reference-geography loaders: RDP regions + ABS ASGS 2021 layers.

Each loader consumes a GeoJSON FeatureCollection (URL or local path) and writes
MultiPolygon geometries to the matching table. ABS ships shapefiles/GeoPackage;
on the homelab the Dagster asset converts them with ogr2ogr first (see the asset
docstrings). RDP comes straight from the budget portal's S3 GeoJSON.
"""
from __future__ import annotations

import os

from ..db import connect
from .sources import fetch_json

RDP_GEOJSON = os.environ.get(
    "RDP_GEOJSON",
    "https://budgetmapprodstorage.s3-ap-southeast-2.amazonaws.com/prod/data/RDP.geojson",
)


def _truncate(cur, table: str) -> None:
    cur.execute(f"TRUNCATE {table} CASCADE")


def load_rdp(source: str | None = None) -> int:
    """Load the 22 RDP regions the budget API tags projects with."""
    fc = fetch_json(source or RDP_GEOJSON)
    rows = 0
    with connect() as conn, conn.cursor() as cur:
        _truncate(cur, "rdp_region")
        for f in fc["features"]:
            props = f["properties"]
            cur.execute(
                """
                INSERT INTO rdp_region (rdp_code, rdp_name, geom)
                VALUES (%s, %s, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)))
                ON CONFLICT (rdp_code) DO UPDATE
                  SET rdp_name = EXCLUDED.rdp_name, geom = EXCLUDED.geom
                """,
                (int(props["RDP_code"]), props.get("Name"), _geom(f)),
            )
            rows += 1
    return rows


def load_polygon_layer(
    source: str,
    table: str,
    column_map: dict[str, str],
    *,
    code_col: str,
) -> int:
    """Generic loader for an ABS polygon layer.

    ``column_map`` maps target columns to GeoJSON property names; ``code_col`` is
    the primary key column used for upsert.
    """
    fc = fetch_json(source)
    cols = list(column_map)
    placeholders = ", ".join(["%s"] * len(cols))
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in cols if c != code_col)
    sql = (
        f"INSERT INTO {table} ({', '.join(cols)}, geom) "
        f"VALUES ({placeholders}, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))) "
        f"ON CONFLICT ({code_col}) DO UPDATE SET {updates}, geom = EXCLUDED.geom"
    )
    rows = 0
    with connect() as conn, conn.cursor() as cur:
        for f in fc["features"]:
            props = f["properties"]
            values = [props.get(column_map[c]) for c in cols]
            cur.execute(sql, (*values, _geom(f)))
            rows += 1
    return rows


def load_sa2(source: str) -> int:
    return load_polygon_layer(
        source,
        "sa2",
        {
            "sa2_code": "SA2_CODE_2021",
            "sa2_name": "SA2_NAME_2021",
            "sa3_code": "SA3_CODE_2021",
            "sa3_name": "SA3_NAME_2021",
            "sa4_code": "SA4_CODE_2021",
            "sa4_name": "SA4_NAME_2021",
            "gccsa_code": "GCC_CODE_2021",
            "state_code": "STE_CODE_2021",
            "area_km2": "AREASQKM21",
        },
        code_col="sa2_code",
    )


def load_lga(source: str) -> int:
    return load_polygon_layer(
        source,
        "lga",
        {
            "lga_code": "LGA_CODE_2021",
            "lga_name": "LGA_NAME_2021",
            "state_code": "STE_CODE_2021",
            "area_km2": "AREASQKM21",
        },
        code_col="lga_code",
    )


import json as _json


def _geom(feature) -> str:
    return _json.dumps(feature["geometry"])
