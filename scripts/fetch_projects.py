#!/usr/bin/env python3
"""Pull QLD capital projects from the public Budget Map API into static files.

Run ad-hoc:  python3 scripts/fetch_projects.py

The public payload differs from the internal Databricks schema the original
spec assumed. Verified shape (2026-05): a top-level JSON array of projects,
geometry expressed only as project-level `latitude`/`longitude` (no
`locations[]`, no WKT, no `impactRadius`). Funding lives under
`projectFunding.total*Funding` (camelCase). `agency.name` and `type.name`
are present. Only points exist, so every emitted feature is a Point.
"""

import json
import urllib.request
from pathlib import Path

API = "https://budgetmap.treasury.qld.gov.au/api/projects"
OUT_DIR = Path(__file__).resolve().parent.parent / "public" / "data"

# QLD bounding box — guards against stray null-island / out-of-state coords.
QLD_BBOX = (137.5, -29.5, 154.5, -9.5)  # minLon, minLat, maxLon, maxLat


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
            "region_lga": project.get("regionLGA"),
            "region_sed": project.get("regionSED"),
            "region_sa4": project.get("regionSA4"),
            "address": project.get("address"),
            "web_link": project.get("webLink"),
        },
    }


def main():
    req = urllib.request.Request(API, headers={"User-Agent": "qld-budget-poc"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = json.load(resp)

    features = [f for f in (to_feature(p) for p in raw) if f is not None]

    # Stable agency ordering by feature count for the legend.
    counts = {}
    for f in features:
        a = f["properties"]["agency"]
        counts[a] = counts.get(a, 0) + 1
    agencies = sorted(counts, key=lambda a: (-counts[a], a))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "projects.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features})
    )
    (OUT_DIR / "meta.json").write_text(
        json.dumps(
            {
                "total_projects": len(raw),
                "mapped_projects": len(features),
                "agencies": [{"name": a, "count": counts[a]} for a in agencies],
                "total_funding": sum(f["properties"]["total_funding"] for f in features),
            }
        )
    )
    print(f"Wrote {len(features)} mapped features (of {len(raw)} projects)")


if __name__ == "__main__":
    main()
