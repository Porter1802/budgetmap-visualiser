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
        },
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    raw = fetch_json(API)
    features = [f for f in (to_feature(p) for p in raw) if f is not None]

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
    (OUT_DIR / "meta.json").write_text(
        json.dumps(
            {
                "total_projects": len(raw),
                "mapped_projects": len(features),
                "regions": regions,
                "total_funding": sum(f["properties"]["total_funding"] for f in features),
            }
        )
    )
    print(
        f"Wrote {len(features)} mapped features (of {len(raw)} projects), "
        f"{len(regions)} regions, {len(rdp['features'])} polygons"
    )


if __name__ == "__main__":
    main()
