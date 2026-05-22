"""Translink GTFS-static loader.

Parses a GTFS zip (URL or path) into transit_stops and transit_routes. Route
geometries are built from shapes.txt, joined to routes via trips.txt. Pure
stdlib (csv/zipfile) so it stays dependency-light and testable.
"""
from __future__ import annotations

import csv
import io
import os
import urllib.request
import zipfile

from ..db import connect
from .sources import UA

GTFS_URL = os.environ.get(
    "GTFS_URL",
    "https://gtfsrt.api.translink.com.au/GTFS/SEQ_GTFS.zip",
)


def _open_zip(source: str) -> zipfile.ZipFile:
    if source.startswith("http"):
        req = urllib.request.Request(source, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as resp:
            return zipfile.ZipFile(io.BytesIO(resp.read()))
    return zipfile.ZipFile(source)


def _rows(zf: zipfile.ZipFile, name: str):
    with zf.open(name) as fh:
        yield from csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig"))


def load_gtfs(source: str | None = None) -> dict:
    zf = _open_zip(source or GTFS_URL)
    counts = {"stops": 0, "routes": 0}
    with connect() as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE transit_stops, transit_routes")

        for s in _rows(zf, "stops.txt"):
            try:
                lon, lat = float(s["stop_lon"]), float(s["stop_lat"])
            except (KeyError, ValueError):
                continue
            cur.execute(
                "INSERT INTO transit_stops (stop_id, stop_name, geom) "
                "VALUES (%s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326)) "
                "ON CONFLICT (stop_id) DO NOTHING",
                (s["stop_id"], s.get("stop_name"), lon, lat),
            )
            counts["stops"] += 1

        # Build shape geometries, then map each route to one representative shape.
        shape_pts: dict[str, list] = {}
        for r in _rows(zf, "shapes.txt"):
            shape_pts.setdefault(r["shape_id"], []).append(
                (int(r["shape_pt_sequence"]), float(r["shape_pt_lon"]), float(r["shape_pt_lat"]))
            )
        route_shapes: dict[str, str] = {}
        for t in _rows(zf, "trips.txt"):
            route_shapes.setdefault(t["route_id"], t.get("shape_id"))

        routes_meta = {r["route_id"]: r for r in _rows(zf, "routes.txt")}
        for route_id, shape_id in route_shapes.items():
            pts = sorted(shape_pts.get(shape_id, []))
            if len(pts) < 2:
                continue
            wkt = "LINESTRING(" + ",".join(f"{lon} {lat}" for _, lon, lat in pts) + ")"
            m = routes_meta.get(route_id, {})
            cur.execute(
                """
                INSERT INTO transit_routes (route_id, agency_id, short_name, long_name, route_type, geom)
                VALUES (%s, %s, %s, %s, %s, ST_Multi(ST_SetSRID(ST_GeomFromText(%s), 4326)))
                ON CONFLICT (route_id) DO UPDATE SET geom = EXCLUDED.geom
                """,
                (
                    route_id, m.get("agency_id"), m.get("route_short_name"),
                    m.get("route_long_name"),
                    int(m["route_type"]) if m.get("route_type") else None, wkt,
                ),
            )
            counts["routes"] += 1
    return counts
