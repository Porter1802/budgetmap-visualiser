#!/usr/bin/env python3
"""Pull QLD capital projects + regions from the public Budget Map into static files.

Run ad-hoc:  python3 scripts/fetch_projects.py

The public payload differs from the internal Databricks schema the original
spec assumed. Verified shape (2026-05): a top-level JSON array of projects,
geometry expressed only as project-level `latitude`/`longitude` (no
`locations[]`, no WKT, no `impactRadius`). Funding lives under
`projectFunding.total*Funding` (camelCase). `type.name` is present and each
project carries a `regions[]` array (id/name/code). Only points exist, so
every emitted feature is a Point.

This also bundles the RDP region polygons (S3 geojson) and region metadata
(regions API) so the app serves them locally with no runtime CORS exposure.
Region codes join projects -> polygons: project.regions[].code == RDP_code.
"""

import json
import urllib.request
from pathlib import Path

API = "https://budgetmap.treasury.qld.gov.au/api/projects"
BP3_API = "https://budgetmap.treasury.qld.gov.au/api/bp3projects"
REGIONS_API = "https://budgetmap.treasury.qld.gov.au/api/regions"
REGIONS_GEOJSON = (
    "https://budgetmapprodstorage.s3-ap-southeast-2.amazonaws.com/prod/data/RDP.geojson"
)
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data"

# QLD bounding box — guards against stray null-island / out-of-state coords.
QLD_BBOX = (137.5, -29.5, 154.5, -9.5)  # minLon, minLat, maxLon, maxLat


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "qld-budget-poc"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def in_qld(lon, lat):
    return QLD_BBOX[0] <= lon <= QLD_BBOX[2] and QLD_BBOX[1] <= lat <= QLD_BBOX[3]


def total_funding(funding):
    return sum(
        funding.get(k) or 0
        for k in (
            "totalQldFunding",
            "totalFedFunding",
            "totalLocalFunding",
            "totalOwnSrcFunding",
            "totalPrivateFunding",
        )
    )


def clean_agency(name):
    # Every department in the published package carries an "(Archived)" suffix;
    # strip it for display.
    return (name or "").replace(" (Archived)", "").strip()


def region_codes(project):
    # project.regions[].code is the RDP code (string); coerce to int to match
    # the polygon layer's RDP_code. Skip blanks defensively.
    codes = []
    for r in project.get("regions") or []:
        code = r.get("code")
        if code is None:
            continue
        try:
            codes.append(int(code))
        except (TypeError, ValueError):
            continue
    return sorted(set(codes))


def to_feature(project):
    lon = project.get("longitude")
    lat = project.get("latitude")
    if lon is None or lat is None or not in_qld(lon, lat):
        return None

    funding = project.get("projectFunding") or {}
    agency = project.get("agency") or {}
    ptype = project.get("type") or {}

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "project_id": project["id"],
            "name": project.get("name"),
            "description": project.get("description"),
            "agency": clean_agency(agency.get("name")),
            "type": ptype.get("name"),
            "status": project.get("status"),
            "qld_funding": funding.get("totalQldFunding") or 0,
            "fed_funding": funding.get("totalFedFunding") or 0,
            "local_funding": funding.get("totalLocalFunding") or 0,
            "own_funding": funding.get("totalOwnSrcFunding") or 0,
            "private_funding": funding.get("totalPrivateFunding") or 0,
            "total_funding": total_funding(funding),
            "region_codes": region_codes(project),
            "region_lga": project.get("regionLGA"),
            "region_sed": project.get("regionSED"),
            "region_sa4": project.get("regionSA4"),
            "address": project.get("address"),
            "web_link": project.get("webLink"),
            "category": "other",
        },
    }


def parse_codes(s):
    # bp3 carries region codes as a comma-separated string of RDP codes.
    codes = []
    for c in (s or "").split(","):
        c = c.strip()
        if not c:
            continue
        try:
            codes.append(int(c))
        except ValueError:
            continue
    return sorted(set(codes))


def bp3_to_feature(project, idx):
    # BP3 (Capital Statement) projects differ from /api/projects: geometry lives
    # in locations[] (project-level lat/long is always null), funding is a single
    # budgetValue in thousands, and there's no funding split, status, or id. We
    # emit one Point at the primary location and synthesise a collision-free id.
    locs = project.get("locations") or []
    if not locs:
        return None
    loc = locs[0]
    lon = loc.get("longitude")
    lat = loc.get("latitude")
    if lon is None or lat is None or not in_qld(lon, lat):
        return None

    try:
        budget_k = int(project.get("budgetValue") or 0)
    except (TypeError, ValueError):
        budget_k = 0

    agency = project.get("agency") or {}
    ptype = project.get("type") or {}

    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {
            "project_id": 90_000_000 + idx,
            "name": project.get("name"),
            "description": project.get("description"),
            "agency": clean_agency(agency.get("name")),
            "type": ptype.get("name"),
            "status": None,
            "qld_funding": 0,
            "fed_funding": 0,
            "local_funding": 0,
            "own_funding": 0,
            "private_funding": 0,
            "total_funding": budget_k * 1000,
            "region_codes": parse_codes(loc.get("sa4Code") or project.get("sa4Code")),
            "region_lga": None,
            "region_sed": None,
            "region_sa4": None,
            "address": None,
            "web_link": project.get("webLink"),
            "category": "capital",
        },
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    raw = fetch_json(API)
    features = [f for f in (to_feature(p) for p in raw) if f is not None]

    # BP3 capital projects, merged into the same feature collection and tagged
    # category="capital" so the app can style and filter them apart.
    bp3_raw = fetch_json(BP3_API)
    bp3_list = bp3_raw.get("projects") if isinstance(bp3_raw, dict) else bp3_raw
    capital = [
        f for f in (bp3_to_feature(p, i) for i, p in enumerate(bp3_list or [])) if f is not None
    ]
    features.extend(capital)

    # Region polygons (RDP_code / Name) — bundled verbatim for the map layer.
    rdp = fetch_json(REGIONS_GEOJSON)
    (OUT_DIR / "regions.geojson").write_text(json.dumps(rdp))

    # Region metadata. Count is the mapped-feature count per region (what the
    # filter actually shows), not the API's full projectCount.
    mapped_per_code = {}
    for f in features:
        for code in f["properties"]["region_codes"]:
            mapped_per_code[code] = mapped_per_code.get(code, 0) + 1

    regions_raw = fetch_json(REGIONS_API)
    regions = []
    for r in regions_raw:
        try:
            code = int(r["code"])
        except (KeyError, TypeError, ValueError):
            continue
        regions.append(
            {"code": code, "name": r.get("name"), "count": mapped_per_code.get(code, 0)}
        )
    regions.sort(key=lambda r: r["code"])

    (OUT_DIR / "projects.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features})
    )
    category_counts = {"capital": 0, "other": 0}
    for f in features:
        category_counts[f["properties"]["category"]] += 1

    (OUT_DIR / "meta.json").write_text(
        json.dumps(
            {
                "total_projects": len(raw) + len(bp3_list or []),
                "mapped_projects": len(features),
                "regions": regions,
                "categories": category_counts,
                "total_funding": sum(f["properties"]["total_funding"] for f in features),
            }
        )
    )
    print(
        f"Wrote {len(features)} mapped features "
        f"({category_counts['other']} other + {category_counts['capital']} capital), "
        f"{len(regions)} regions, {len(rdp['features'])} polygons"
    )


if __name__ == "__main__":
    main()
