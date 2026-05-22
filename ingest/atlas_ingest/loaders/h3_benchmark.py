"""H3 indexing experiment: same R7 $-per-hex aggregation, PostGIS vs DuckDB.

The Phase 6 learning goal — does the lakehouse path (DuckDB over GeoParquet +
the H3 community extension) beat in-database PostGIS for the statewide hexbin?
Run: python -m atlas_ingest.loaders.h3_benchmark
"""
from __future__ import annotations

import os
import time

import duckdb

from ..db import connect

RES = 7


def _time(fn, *a):
    t = time.perf_counter()
    out = fn(*a)
    return out, (time.perf_counter() - t) * 1000.0


def postgis_hexbin() -> int:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT h3_lat_lng_to_cell(ST_Centroid(geom), %s) AS h3, count(*)
            FROM project_locations WHERE geom IS NOT NULL
            GROUP BY 1
            """,
            (RES,),
        )
        return len(cur.fetchall())


def duckdb_hexbin(parquet: str) -> int:
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("INSTALL h3 FROM community; LOAD h3;")
    rows = con.execute(
        f"""
        SELECT h3_latlng_to_cell(ST_Y(ST_Centroid(geom)), ST_X(ST_Centroid(geom)), {RES}) AS h3,
               count(*)
        FROM read_parquet('{parquet}')
        WHERE geom IS NOT NULL
        GROUP BY 1
        """
    ).fetchall()
    con.close()
    return len(rows)


def main():
    parquet = os.path.join(os.environ.get("LAKEHOUSE_DIR", "/tmp/atlas-lakehouse"), "project_locations.parquet")
    pg_cells, pg_ms = _time(postgis_hexbin)
    dd_cells, dd_ms = _time(duckdb_hexbin, parquet)
    print(f"PostGIS   : {pg_cells:5d} hexes  {pg_ms:8.1f} ms")
    print(f"DuckDB+H3 : {dd_cells:5d} hexes  {dd_ms:8.1f} ms")


if __name__ == "__main__":
    main()
