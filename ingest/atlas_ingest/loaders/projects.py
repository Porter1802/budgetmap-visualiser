"""Capital-projects loader.

Ports the verified public-API logic from the POC's fetch_projects.py to write
the canonical tables instead of static GeoJSON:

  /api/projects     -> projects (category 'other'), one synthesised point
                       location each, 5-way funding split.
  /api/bp3projects  -> projects (category 'capital'), 1:N locations[] (lat/long),
                       single budgetValue (no source split -> recorded as 'qld').

Geometry is built WKT-aware (decision #3): WKT wins, then GeoJSON, then the
lat/long point. When ~June 2026 adds WKT to /api/projects this code already
handles it — no change needed.
"""
from __future__ import annotations

import itertools
import os

from ..db import connect
from .sources import fetch_json, in_qld

BUDGET_API = os.environ.get("BUDGET_API", "https://budgetmap.treasury.qld.gov.au/api/projects")
BP3_API = os.environ.get("BP3_API", "https://budgetmap.treasury.qld.gov.au/api/bp3projects")
PACKAGE_ID = int(os.environ.get("PACKAGE_ID", "1"))
FINANCIAL_YEAR = os.environ.get("PACKAGE_FINANCIAL_YEAR", "2024-25")

BP3_ID_OFFSET = 90_000_000

FUNDING_KEYS = {
    "qld": "totalQldFunding",
    "fed": "totalFedFunding",
    "local": "totalLocalFunding",
    "own_src": "totalOwnSrcFunding",
    "private": "totalPrivateFunding",
}
ANNUAL_KEYS = {
    "qld": "annualQldFunding",
    "fed": "annualFedFunding",
    "local": "annualLocalFunding",
    "own_src": "annualOwnSrcFunding",
    "private": "annualPrivateFunding",
}


def _clean_agency(name: str | None) -> str:
    return (name or "").replace(" (Archived)", "").strip()


def _int_or_none(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# Build geom from whatever the location offers; ST params passed positionally.
_GEOM_EXPR = """
    COALESCE(
      CASE WHEN %s::text IS NOT NULL THEN ST_GeomFromText(%s::text, 4326) END,
      CASE WHEN %s::text IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON(%s::text), 4326) END,
      CASE WHEN %s::float8 IS NOT NULL AND %s::float8 IS NOT NULL
           THEN ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326) END
    )
"""


def _insert_project(cur, project_id, category, p, agency, ptype, funding):
    cur.execute(
        """
        INSERT INTO projects (
          project_id, package_id, financial_year, package_version,
          name, description, activity_word,
          agency_id, agency_name, type_id, type_name, category,
          in_qld_program, in_fed_program, qld_program_name, fed_program_name,
          is_commitment, is_new_initiative, from_bp3, status,
          pin_latitude, pin_longitude, pin_geom,
          region_sa4, region_lga, region_sed, raw)
        VALUES (
          %s, %s, %s, 1,
          %s, %s, %s,
          %s, %s, %s, %s, %s,
          %s, %s, %s, %s,
          %s, %s, %s, %s,
          %s, %s,
          CASE WHEN %s::float8 IS NOT NULL AND %s::float8 IS NOT NULL
               THEN ST_SetSRID(ST_MakePoint(%s::float8, %s::float8), 4326) END,
          %s, %s, %s, %s::jsonb)
        ON CONFLICT (project_id, package_id) DO UPDATE SET
          name = EXCLUDED.name, description = EXCLUDED.description,
          agency_name = EXCLUDED.agency_name, type_name = EXCLUDED.type_name,
          category = EXCLUDED.category, status = EXCLUDED.status,
          pin_geom = EXCLUDED.pin_geom, raw = EXCLUDED.raw,
          ingested_at = now()
        """,
        (
            project_id, PACKAGE_ID, FINANCIAL_YEAR,
            p.get("name"), p.get("description"), p.get("activityWord"),
            _int_or_none(agency.get("id")), _clean_agency(agency.get("name")),
            _int_or_none(ptype.get("id")), ptype.get("name"), category,
            p.get("inQldProgram"), p.get("inFedProgram"),
            p.get("qldProgramName"), p.get("fedProgramName"),
            p.get("isCommitment"), p.get("isNewInitiative"),
            bool(p.get("fromBP3")) or category == "capital", _int_or_none(p.get("status")),
            p.get("latitude"), p.get("longitude"),
            p.get("longitude"), p.get("latitude"), p.get("longitude"), p.get("latitude"),
            p.get("regionSA4"), p.get("regionLGA"), p.get("regionSED"),
            _json(p),
        ),
    )
    for source, total in funding.items():
        annual = funding.get(f"_annual_{source}")
        if total is None and annual is None:
            continue
        cur.execute(
            """
            INSERT INTO project_funding
              (project_id, package_id, funding_source, annual_amount_aud, total_amount_aud)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (project_id, package_id, funding_source) DO UPDATE SET
              annual_amount_aud = EXCLUDED.annual_amount_aud,
              total_amount_aud = EXCLUDED.total_amount_aud
            """,
            (project_id, PACKAGE_ID, source, annual, total),
        )


def _insert_location(cur, location_id, project_id, loc):
    lon, lat = loc.get("longitude"), loc.get("latitude")
    wkt = loc.get("geometry") or loc.get("geometryWkt")
    gj = loc.get("geometryGeoJSON")
    gj_str = _json(gj) if isinstance(gj, (dict, list)) else gj
    radius = loc.get("impactRadius")
    geom_args = (wkt, wkt, gj_str, gj_str, lon, lat, lon, lat)
    cur.execute(
        f"""
        INSERT INTO project_locations (
          location_id, project_id, package_id, address,
          latitude, longitude, geometry_wkt, geometry_geojson, geometry_type,
          impact_radius_m, geom, excluded)
        VALUES (
          %s, %s, %s, %s,
          %s, %s, %s, %s, %s,
          %s, {_GEOM_EXPR}, %s)
        ON CONFLICT (location_id) DO UPDATE SET
          geom = EXCLUDED.geom, impact_radius_m = EXCLUDED.impact_radius_m,
          excluded = EXCLUDED.excluded
        """,
        (
            location_id, project_id, PACKAGE_ID, loc.get("address"),
            lat, lon, wkt, gj_str, loc.get("geometryType") or ("Point" if lon is not None else None),
            radius, *geom_args, bool(loc.get("excluded", False)),
        ),
    )


def _funding_from_projectfunding(pf: dict) -> dict:
    out = {}
    for source, key in FUNDING_KEYS.items():
        out[source] = pf.get(key)
        out[f"_annual_{source}"] = pf.get(ANNUAL_KEYS[source])
    return out


def load_projects(projects_source=None, bp3_source=None) -> dict:
    raw = fetch_json(projects_source or BUDGET_API)
    bp3_raw = fetch_json(bp3_source or BP3_API)
    bp3_list = bp3_raw.get("projects") if isinstance(bp3_raw, dict) else bp3_raw

    loc_ids = itertools.count(1)
    counts = {"projects": 0, "capital": 0, "locations": 0, "funding": 0}

    with connect() as conn, conn.cursor() as cur:
        cur.execute("TRUNCATE project_location_sa2, project_funding, project_locations, projects CASCADE")

        for p in raw:
            pid = _int_or_none(p.get("id"))
            if pid is None:
                continue
            agency, ptype = p.get("agency") or {}, p.get("type") or {}
            funding = _funding_from_projectfunding(p.get("projectFunding") or {})
            _insert_project(cur, pid, "other", p, agency, ptype, funding)
            counts["projects"] += 1
            lon, lat = p.get("longitude"), p.get("latitude")
            if in_qld(lon, lat):
                _insert_location(
                    cur, next(loc_ids), pid,
                    {"latitude": lat, "longitude": lon, "geometryType": "Point",
                     "address": p.get("address")},
                )
                counts["locations"] += 1

        for idx, p in enumerate(bp3_list or []):
            pid = BP3_ID_OFFSET + idx
            agency, ptype = p.get("agency") or {}, p.get("type") or {}
            budget_k = _int_or_none(p.get("budgetValue")) or 0
            funding = {"qld": budget_k * 1000}  # Capital Statement: state capital, no split
            _insert_project(cur, pid, "capital", p, agency, ptype, funding)
            counts["capital"] += 1
            for loc in p.get("locations") or []:
                if not in_qld(loc.get("longitude"), loc.get("latitude")):
                    continue
                _insert_location(cur, next(loc_ids), pid, loc)
                counts["locations"] += 1

        # Buffer point locations that carry an impact radius (none yet on public
        # data, but ready for it).
        cur.execute(
            """
            UPDATE project_locations
            SET geom_buffered = ST_Buffer(geom::geography, impact_radius_m)::geometry(Polygon, 4326)
            WHERE impact_radius_m IS NOT NULL AND geom IS NOT NULL
            """
        )
        cur.execute("SELECT count(*) FROM project_funding")
        counts["funding"] = cur.fetchone()[0]

    return counts


import json as _jsonmod


def _json(obj) -> str:
    return _jsonmod.dumps(obj)
