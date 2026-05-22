"""DuckDB read path over the GeoParquet lakehouse mirror.

Heavy analytical queries the frontend shouldn't push at Postgres run here. Only
a fixed allowlist of named, parameterised queries is exposed — no arbitrary SQL
(the NL-to-SQL stretch goal would slot in behind the same allowlist gate).
"""
from __future__ import annotations

import os

import duckdb

LAKEHOUSE_DIR = os.environ.get("LAKEHOUSE_DIR", "/tmp/atlas-lakehouse")


def _con() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    if os.environ.get("MINIO_ENDPOINT"):
        con.execute("INSTALL httpfs; LOAD httpfs;")
        con.execute(f"SET s3_endpoint='{os.environ['MINIO_ENDPOINT']}'")
        con.execute("SET s3_url_style='path'; SET s3_use_ssl=false;")
        con.execute(f"SET s3_access_key_id='{os.environ.get('MINIO_ACCESS_KEY','')}'")
        con.execute(f"SET s3_secret_access_key='{os.environ.get('MINIO_SECRET_KEY','')}'")
    return con


def _path(table: str) -> str:
    if os.environ.get("MINIO_ENDPOINT"):
        bucket = os.environ.get("MINIO_BUCKET", "atlas-lakehouse")
        return f"s3://{bucket}/{table}.parquet"
    return os.path.join(LAKEHOUSE_DIR, f"{table}.parquet")


def funding_by_agency(limit: int = 25) -> list[dict]:
    con = _con()
    try:
        rows = con.execute(
            f"""
            SELECT p.agency_name,
                   sum(f.total_amount_aud)::BIGINT AS total_funding_aud,
                   count(DISTINCT p.project_id)     AS project_count
            FROM read_parquet('{_path("projects")}') p
            JOIN read_parquet('{_path("project_funding")}') f
              ON f.project_id = p.project_id AND f.package_id = p.package_id
            WHERE p.agency_name IS NOT NULL
            GROUP BY 1 ORDER BY 2 DESC LIMIT ?
            """,
            [limit],
        ).fetchall()
        cols = [d[0] for d in con.description]
        return [dict(zip(cols, r)) for r in rows]
    finally:
        con.close()
