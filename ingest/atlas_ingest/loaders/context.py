"""Context-layer loaders (spec §3.4).

Service layers (schools, hospitals) come from data.qld CKAN datastore and load
in full here. Indicator layers (SEIFA, ERP, Census) come from ABS data files;
their loaders accept a pre-parsed CSV/JSON path so the heavy ABS download/parse
happens in the Dagster asset (homelab) and the loader stays testable.
"""
from __future__ import annotations

import csv
import io
import os
import urllib.parse
import urllib.request

from ..db import connect
from .sources import UA, in_qld

DATASTORE = "https://www.data.qld.gov.au/api/3/action/datastore_search"
SCHOOLS_RESOURCE = os.environ.get("SCHOOLS_RESOURCE", "5b39065c-df32-415c-994c-5ff12f8de997")
HOSPITALS_RESOURCE = os.environ.get("HOSPITALS_RESOURCE", "7de61fec-6670-4cad-a163-d955f0102cef")


def _fetch_datastore(resource_id: str, limit: int = 5000) -> list[dict]:
    url = f"{DATASTORE}?{urllib.parse.urlencode({'resource_id': resource_id, 'limit': limit})}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    import json

    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)["result"]["records"]


def _coord(rec, lat_key="Latitude", lon_key="Longitude"):
    try:
        return float(rec[lon_key]), float(rec[lat_key])
    except (KeyError, TypeError, ValueError):
        return None


def load_schools() -> int:
    records = _fetch_datastore(SCHOOLS_RESOURCE)
    rows = 0
    with connect() as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE schools")
        for r in records:
            c = _coord(r)
            if not c or not in_qld(*c):
                continue
            lon, lat = c
            cur.execute(
                """
                INSERT INTO schools (name, sector, centre_type, lga_name, geom)
                VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                """,
                (
                    r.get("Centre Name"),
                    r.get("Sector"),
                    r.get("Centre Type") or "School",
                    r.get("Local Government Area"),
                    lon,
                    lat,
                ),
            )
            rows += 1
    return rows


def load_hospitals(geocode=None) -> int:
    """Load QH hospitals. Addresses only -> caller passes a geocoder(name, address)
    -> (lon, lat) | None (the Dagster asset wires in the cached Nominatim client)."""
    records = _fetch_datastore(HOSPITALS_RESOURCE)
    rows = 0
    with connect() as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE hospitals")
        for r in records:
            name = r.get("Facility Name")
            if not name:
                continue
            coord = geocode(name, r.get("Address")) if geocode else None
            if not coord or not in_qld(*coord):
                continue
            lon, lat = coord
            cur.execute(
                """
                INSERT INTO hospitals (name, hhs, phone, address, geom)
                VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                """,
                (
                    name,
                    r.get("Hospital and Health Service"),
                    r.get("Phone Number"),
                    r.get("Address"),
                    lon,
                    lat,
                ),
            )
            rows += 1
    return rows


def load_seifa_csv(path: str) -> int:
    """Load SEIFA indices from a CSV with columns sa2_code, irsd_score, irsd_decile,
    irsad_score, irsad_decile, ier_score, ieo_score."""
    rows = 0
    with connect() as conn, conn.cursor() as cur, open(path, newline="") as fh:
        cur.execute("TRUNCATE seifa")
        for r in csv.DictReader(fh):
            cur.execute(
                """
                INSERT INTO seifa (sa2_code, irsd_score, irsd_decile, irsad_score,
                                   irsad_decile, ier_score, ieo_score)
                VALUES (%(sa2_code)s, %(irsd_score)s, %(irsd_decile)s, %(irsad_score)s,
                        %(irsad_decile)s, %(ier_score)s, %(ieo_score)s)
                ON CONFLICT (sa2_code) DO UPDATE SET
                  irsd_score = EXCLUDED.irsd_score, irsd_decile = EXCLUDED.irsd_decile
                """,
                {k: (v or None) for k, v in r.items()},
            )
            rows += 1
    return rows


def load_erp_csv(path: str) -> int:
    """Load ABS ERP time series from a CSV with columns sa2_code, year, erp."""
    rows = 0
    with connect() as conn, conn.cursor() as cur, open(path, newline="") as fh:
        cur.execute("TRUNCATE population_erp")
        for r in csv.DictReader(fh):
            cur.execute(
                "INSERT INTO population_erp (sa2_code, year, erp) VALUES (%s, %s, %s) "
                "ON CONFLICT (sa2_code, year) DO UPDATE SET erp = EXCLUDED.erp",
                (r["sa2_code"], int(r["year"]), int(r["erp"])),
            )
            rows += 1
    return rows
