"""Lakehouse mirror: export PostGIS tables to GeoParquet (local dir or MinIO/S3).

Uses DuckDB's postgres + spatial extensions to read from Postgres and write
GeoParquet. When MINIO_ENDPOINT is set the output goes to s3://; otherwise to a
local directory (LAKEHOUSE_DIR). This is the nightly Dagster export feeding the
DuckDB-backed analytical API.
"""
from __future__ import annotations

import os

import duckdb

from ..db import database_url

EXPORT_TABLES = [
    "projects",
    "project_locations",
    "project_funding",
    "project_location_sa2",
    "sa2",
]


def _duck() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial; INSTALL postgres; LOAD postgres;")
    con.execute(f"ATTACH '{_pg_dsn()}' AS pg (TYPE postgres, READ_ONLY)")
    return con


def _pg_dsn() -> str:
    # DuckDB's postgres extension wants a libpq DSN, not a URL.
    url = database_url()
    # postgresql://user:pw@host:port/db -> dbname=... host=... ...
    from urllib.parse import urlparse

    u = urlparse(url)
    return (
        f"dbname={u.path.lstrip('/')} user={u.username} password={u.password} "
        f"host={u.hostname} port={u.port or 5432}"
    )


def _target(table: str) -> str:
    endpoint = os.environ.get("MINIO_ENDPOINT")
    if endpoint:
        bucket = os.environ.get("MINIO_BUCKET", "atlas-lakehouse")
        return f"s3://{bucket}/{table}.parquet"
    out = os.environ.get("LAKEHOUSE_DIR", "/tmp/atlas-lakehouse")
    os.makedirs(out, exist_ok=True)
    return os.path.join(out, f"{table}.parquet")


def export_geoparquet(tables: list[str] | None = None) -> dict:
    con = _duck()
    if os.environ.get("MINIO_ENDPOINT"):
        con.execute("INSTALL httpfs; LOAD httpfs;")
        con.execute(f"SET s3_endpoint='{os.environ['MINIO_ENDPOINT']}'")
        con.execute("SET s3_url_style='path'; SET s3_use_ssl=false;")
        con.execute(f"SET s3_access_key_id='{os.environ.get('MINIO_ACCESS_KEY', '')}'")
        con.execute(f"SET s3_secret_access_key='{os.environ.get('MINIO_SECRET_KEY', '')}'")

    written = {}
    for t in tables or EXPORT_TABLES:
        # Geometry columns come across as WKB; store as parquet with a geometry
        # blob (GeoParquet-style) so DuckDB spatial can read it back.
        con.execute(
            f"COPY (SELECT * FROM pg.public.{t}) TO '{_target(t)}' (FORMAT parquet)"
        )
        written[t] = con.execute(f"SELECT count(*) FROM pg.public.{t}").fetchone()[0]
    con.close()
    return written
